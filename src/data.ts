import type { Category, Intensity, Session, TrainingWeek } from "./types";
export const iso = (d: Date) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
export const mondayOf = (d = new Date()) => {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(12, 0, 0, 0);
  return x;
};
const add = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return iso(x);
};
export const kind = (c: Category) =>
  c.includes("run") || c === "Speed work"
    ? "run"
    : c.includes("strength") || c === "Core and accessories"
      ? "strength"
      : c === "Indoor bike"
        ? "bike"
        : "recovery";
export function isValidDayCombination(
  sessions: Session[],
  day: number,
  wfhDays: number[],
): boolean {
  const multiDay = day >= 5 || wfhDays.includes(day);
  if (sessions.length > (multiDay ? 3 : 1)) return false;
  if (sessions.length > 1 && !multiDay) return false;
  const types = ["run", "bike", "strength"] as const;
  if (
    types.some(
      (type) =>
        sessions.filter((session) => kind(session.category) === type).length >
        1,
    )
  )
    return false;
  if (
    sessions.some((session) => session.category === "Speed work") &&
    sessions.length !== 1
  )
    return false;
  if (
    sessions.some((session) => session.category === "Long run") &&
    sessions.some((session) => kind(session.category) === "bike")
  )
    return false;
  if (
    sessions.length > 1 &&
    sessions.filter((session) => session.intensity === "hard").length > 1
  )
    return false;
  return true;
}
export const sessionTarget = (session: Session) =>
  session.actualDistanceKm
    ? `${session.actualDistanceKm} km`
    : session.plannedDistanceKm
      ? `${session.plannedDistanceKm} km`
      : session.actualDurationMinutes
        ? `${session.actualDurationMinutes} min`
        : session.plannedDurationMinutes
          ? `${session.plannedDurationMinutes} min`
          : "Flexible";
export interface FatigueWarning {
  id: string;
  title: string;
  detail: string;
  severity: "watch" | "high";
}
export function makeWeek(start = mondayOf()): TrainingWeek {
  const defs: [number, Category, string, number?, number?, Intensity?][] = [
    [0, "Upper-body strength", "Chest & Triceps", 50, undefined, "moderate"],
    [0, "Indoor bike", "Recovery spin", undefined, 20, "easy"],
    [1, "Easy run", "Easy run", undefined, 5, "easy"],
    [4, "Easy run", "Recovery run", undefined, 4, "easy"],
    [2, "Upper-body strength", "Back & Biceps", 50, undefined, "moderate"],
    [2, "Indoor bike", "Steady aerobic ride", undefined, 35, "moderate"],
    [3, "Speed work", "Speed work", undefined, 5, "hard"],
    [3, "Core and accessories", "Core", 30, undefined, "easy"],
    [5, "Lower-body strength", "Legs", 60, undefined, "hard"],
    [6, "Long run", "Long easy run", undefined, 8, "easy"],
    [6, "Upper-body strength", "Arms", 25, undefined, "easy"],
  ];
  const sessions: Session[] = defs.map((v) => ({
    id: crypto.randomUUID(),
    date: add(start, v[0]),
    category: v[1],
    title: v[2],
    plannedDurationMinutes: v[3],
    plannedDistanceKm: v[4],
    intensity: v[5] ?? "moderate",
    completed: false,
    skipped: false,
  }));
  return {
    id: crypto.randomUUID(),
    startDate: iso(start),
    sessions,
    createdAt: new Date().toISOString(),
  };
}

export function makeWfhWeek(
  start: Date,
  wfhDays: number[],
  includeSpeedWork = true,
  includeLegDay = true,
): TrainingWeek {
  const week = makeWeek(start);
  if (!includeLegDay)
    week.sessions = week.sessions.filter(
      (session) =>
        session.category !== "Lower-body strength" && session.title !== "Legs",
    );
  if (!includeSpeedWork) {
    const speed = week.sessions.find(
      (session) => session.category === "Speed work",
    );
    if (speed) {
      speed.category = "Easy run";
      speed.title = "Easy run";
      speed.intensity = "easy";
    }
  }
  const weekendBike = week.sessions.find(
    (s) => s.category === "Indoor bike" && s.title === "Recovery spin",
  );
  if (weekendBike) weekendBike.date = add(start, 5);
  const fixed = week.sessions.filter(
    (s) => s.category === "Long run" || s === weekendBike,
  );
  const flexible = week.sessions
    .filter((s) => !fixed.includes(s))
    .sort((a, b) => workoutOrder(a) - workoutOrder(b));
  const counts = Array(7).fill(0) as number[];
  const strengthDays = new Set<number>();
  const bikeDays: number[] = [];
  const runDays = new Set<number>();
  const upperFatigueDays = new Set<number>();
  let coreDay: number | undefined;
  fixed.forEach((s) => {
    const index = Math.round(
      (parseDate(s.date).getTime() - parseDate(week.startDate).getTime()) /
        86400000,
    );
    counts[index]++;
    if (kind(s.category) === "strength") strengthDays.add(index);
    if (kind(s.category) === "run") runDays.add(index);
    if (s.category === "Indoor bike") bikeDays.push(index);
  });
  const candidates = [0, 1, 2, 3, 4, 5, 6];
  for (const session of flexible) {
    let available = candidates.filter(
      (day) => counts[day] < (day >= 5 || wfhDays.includes(day) ? 3 : 1),
    );
    if (kind(session.category) === "strength") {
      available = available.filter(
        (day) =>
          !strengthDays.has(day) &&
          !week.sessions.some(
            (item) =>
              item.date === add(start, day) && item.category === "Speed work",
          ),
      );
      if (session.title === "Core")
        available = available.filter((day) => day < 5);
      if (session.category === "Lower-body strength")
        available = available.filter((day) => day <= 3);
      const paired = available.filter(
        (day) =>
          counts[day] === 1 &&
          week.sessions.some(
            (item) =>
              item.date === add(start, day) &&
              (kind(item.category) === "run" || kind(item.category) === "bike"),
          ),
      );
      if (paired.length) available = paired;
    }
    if (session.category === "Indoor bike") {
      available = available.filter(
        (day) =>
          !bikeDays.includes(day) &&
          day !== coreDay &&
          !(runDays.has(day) && day < 5 && !wfhDays.includes(day)) &&
          !week.sessions.some(
            (item) =>
              item.date === add(start, day) && item.category === "Long run",
          ),
      );
      const paired = available.filter((day) => strengthDays.has(day));
      if (paired.length) available = paired;
      const separated = available.filter((day) =>
        bikeDays.every((existing) => Math.abs(existing - day) >= 2),
      );
      if (separated.length) available = separated;
      else available = available.filter((day) => !bikeDays.includes(day));
    }
    if (kind(session.category) === "run") {
      available = available.filter(
        (day) =>
          !runDays.has(day) &&
          !(bikeDays.includes(day) && day < 5 && !wfhDays.includes(day)) &&
          !(session.category === "Long run" && bikeDays.includes(day)),
      );
      if (session.category === "Speed work")
        available = available.filter(
          (day) => counts[day] === 0 && !wfhDays.includes(day),
        );
      else {
        const paired = available.filter((day) => strengthDays.has(day)),
          corePair =
            coreDay === undefined
              ? []
              : paired.filter((day) => day === coreDay);
        if (corePair.length) available = corePair;
        else if (paired.length) available = paired;
      }
    }
    const pool = available.length ? available : candidates;
    const day = [...pool].sort(
      (a, b) =>
        scoreDay(a, session, wfhDays, counts, runDays, upperFatigueDays) -
        scoreDay(b, session, wfhDays, counts, runDays, upperFatigueDays),
    )[0];
    session.date = add(start, day);
    counts[day]++;
    if (kind(session.category) === "strength") strengthDays.add(day);
    if (
      session.title === "Back & Biceps" ||
      session.title === "Chest & Triceps"
    )
      upperFatigueDays.add(day);
    if (session.title === "Core") coreDay = day;
    if (kind(session.category) === "run") runDays.add(day);
    if (session.category === "Indoor bike") bikeDays.push(day);
  }
  for (const targetDay of wfhDays) {
    const targetDate = add(start, targetDay);
    while (
      week.sessions.filter((session) => session.date === targetDate).length < 2
    ) {
      const target = week.sessions.filter(
        (session) => session.date === targetDate,
      );
      const movable = week.sessions.find((session) => {
        const sourceDay = Math.round(
            (parseDate(session.date).getTime() -
              parseDate(week.startDate).getTime()) /
              86400000,
          ),
          source = week.sessions.filter((item) => item.date === session.date),
          minimum = sourceDay >= 5 || wfhDays.includes(sourceDay) ? 2 : 1;
        if (
          sourceDay === targetDay ||
          source.length <= minimum ||
          session.category === "Speed work"
        )
          return false;
        const combined = [...target, session];
        return isValidDayCombination(combined, targetDay, wfhDays);
      });
      if (!movable) break;
      movable.date = targetDate;
    }
  }
  for (let day = 0; day < 7; day++) {
    const date = add(start, day);
    if (!week.sessions.some((session) => session.date === date)) {
      const donorDate = Array.from({ length: 7 }, (_, index) => index)
        .map((index) => ({
          index,
          date: add(start, index),
          count: week.sessions.filter(
            (session) => session.date === add(start, index),
          ).length,
        }))
        .filter(
          (item) =>
            item.count >
            (wfhDays.includes(item.index) || item.index >= 5 ? 2 : 1),
        )
        .sort(
          (a, b) =>
            b.count -
            (wfhDays.includes(b.index) || b.index >= 5 ? 2 : 1) -
            (a.count - (wfhDays.includes(a.index) || a.index >= 5 ? 2 : 1)),
        )[0]?.date;
      const donorSessions = donorDate
        ? week.sessions.filter(
            (session) =>
              session.date === donorDate &&
              session.title !== "Legs" &&
              session.category !== "Speed work" &&
              session.category !== "Long run",
          )
        : [];
      const movable =
        donorSessions.find((session) => session.category === "Easy run") ??
        donorSessions.find((session) => session.category !== "Indoor bike") ??
        donorSessions[0];
      if (movable) movable.date = date;
    }
  }
  const weekdayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const selected = wfhDays.map((day) => weekdayNames[day]).join(" and ");
  week.generationExplanation = [
    wfhDays.length
      ? `${selected} ${wfhDays.length === 1 ? "was" : "were"} prioritised for double sessions because ${wfhDays.length === 1 ? "it is" : "they are"} WFH.`
      : "No WFH days were selected, so strength and endurance sessions were spread across the week.",
    "Every day contains running, cycling or a strength workout from your saved plan; no walking or mobility placeholder is added.",
    includeSpeedWork
      ? "Speed work was kept as a standalone hard session."
      : "Speed work was replaced by an easy run, keeping four easy runs in the week.",
    includeLegDay
      ? "A dedicated leg strength session was included."
      : "Dedicated leg strength was left out because running and cycling cover lower-body training.",
    "WFH days and weekends may combine one run, one ride and one strength session; duplicate session types are never placed together.",
    "The long run stays on the weekend and never shares its day with cycling.",
  ];
  return scheduleGeneratedSessions(
    { ...week, planningContext: { wfhDays, includeLegDay } },
    wfhDays,
  );
}
function scheduleGeneratedSessions(
  week: TrainingWeek,
  wfhDays: number[],
): TrainingWeek {
  const start = parseDate(week.startDate);
  const originalDay = new Map(
    week.sessions.map((session) => [
      session.id,
      Math.round(
        (parseDate(session.date).getTime() - start.getTime()) / 86400000,
      ),
    ]),
  );
  const ordered = [...week.sessions].sort((a, b) => {
    const priority = (session: Session) =>
      session.category === "Long run"
        ? 0
        : session.category === "Speed work"
          ? 1
          : session.title === "Core"
            ? 2
            : session.category === "Lower-body strength"
              ? 3
              : kind(session.category) === "bike"
                ? 4
                : kind(session.category) === "run"
                  ? 5
                  : 6;
    return priority(a) - priority(b);
  });
  const attempt = (source: Session[]): Session[] | undefined => {
    const days: Session[][] = Array.from({ length: 7 }, () => []);
    const place = (index: number): boolean => {
      if (index === source.length) {
        if (
          days.some((items) => items.length === 0) ||
          wfhDays.some((day) => days[day].length < 2) ||
          days[5].length < 2 ||
          days[6].length < 2
        )
          return false;
        const runDays = new Set(
            days.flatMap((items, day) =>
              items.some((session) => kind(session.category) === "run")
                ? [day]
                : [],
            ),
          ),
          bikeDays = new Set(
            days.flatMap((items, day) =>
              items.some((session) => kind(session.category) === "bike")
                ? [day]
                : [],
            ),
          );
        for (let day = 0; day <= 4; day++)
          if (runDays.has(day) && runDays.has(day + 1) && runDays.has(day + 2))
            return false;
        for (let day = 0; day <= 5; day++)
          if (bikeDays.has(day) && bikeDays.has(day + 1)) return false;
        const at = (title: string) =>
            days.findIndex((items) =>
              items.some((session) => session.title === title),
            ),
          arms = at("Arms"),
          chest = at("Chest & Triceps"),
          back = at("Back & Biceps");
        if (
          arms >= 0 &&
          chest >= 0 &&
          back >= 0 &&
          arms > Math.min(chest, back) &&
          arms < Math.max(chest, back)
        )
          return false;
        const core = at("Core");
        if (
          core >= 0 &&
          wfhDays.length > 0 &&
          !days[core].some((session) => kind(session.category) === "run")
        )
          return false;
        const legs = at("Legs"),
          long = days.findIndex((items) =>
            items.some((session) => session.category === "Long run"),
          );
        if (legs >= 0 && long >= 0 && Math.abs(legs - long) < 3) return false;
        return true;
      }
      const session = source[index];
      const candidates = Array.from({ length: 7 }, (_, day) => day)
        .filter((day) => {
          if (session.category === "Long run" && day < 5) return false;
          if (
            session.category === "Speed work" &&
            (day >= 5 || wfhDays.includes(day))
          )
            return false;
          if (session.title === "Core") {
            if (day >= 5) return false;
            if (wfhDays.length > 0 && !wfhDays.includes(day)) return false;
          }
          if (session.category === "Lower-body strength" && day > 3)
            return false;
          return isValidDayCombination([...days[day], session], day, wfhDays);
        })
        .sort((a, b) => {
          const minimumA = a >= 5 || wfhDays.includes(a) ? 2 : 1,
            minimumB = b >= 5 || wfhDays.includes(b) ? 2 : 1,
            needA = days[a].length < minimumA ? -20 : 0,
            needB = days[b].length < minimumB ? -20 : 0;
          return (
            needA -
            needB +
            Math.abs(a - (originalDay.get(session.id) ?? a)) -
            Math.abs(b - (originalDay.get(session.id) ?? b))
          );
        });
      for (const day of candidates) {
        days[day].push(session);
        if (place(index + 1)) return true;
        days[day].pop();
      }
      return false;
    };
    if (!place(0)) return undefined;
    return days.flatMap((items, day) =>
      items.map((session) => ({ ...session, date: add(start, day) })),
    );
  };
  let sessions = attempt(ordered);
  if (!sessions) {
    const removable = ["Arms", "Core", "Legs"].find((title) =>
      ordered.some(
        (session) =>
          session.title === title && !session.completed && !session.locked,
      ),
    );
    if (removable)
      sessions = attempt(
        ordered.filter((session) => session.title !== removable),
      );
  }
  return { ...week, sessions: sessions ?? week.sessions };
}
function ensureCoreRunPair(week: TrainingWeek): TrainingWeek {
  const sessions = week.sessions.map((session) => ({ ...session })),
    core = sessions.find((session) => session.title === "Core");
  if (
    !core ||
    sessions.some(
      (session) =>
        session.date === core.date && kind(session.category) === "run",
    )
  )
    return { ...week, sessions };
  const pairDate = sessions.find(
    (session) =>
      kind(session.category) === "run" &&
      session.category !== "Speed work" &&
      sessions.some(
        (item) =>
          item.date === session.date &&
          kind(item.category) === "strength" &&
          item.title !== "Core" &&
          !item.locked &&
          !item.completed,
      ),
  )?.date;
  const strength = pairDate
    ? sessions.find(
        (session) =>
          session.date === pairDate &&
          kind(session.category) === "strength" &&
          session.title !== "Core" &&
          !session.locked &&
          !session.completed,
      )
    : undefined;
  if (!strength || core.locked || core.completed) return { ...week, sessions };
  const coreDate = core.date;
  core.date = strength.date;
  strength.date = coreDate;
  return { ...week, sessions };
}
function balanceEnduranceDays(
  week: TrainingWeek,
  wfhDays: number[],
  preferredDays: number[] = [],
): TrainingWeek {
  const start = parseDate(week.startDate),
    dayOf = (date: string) =>
      Math.round((parseDate(date).getTime() - start.getTime()) / 86400000),
    slots = Array.from({ length: 7 }, (_, day) => day);
  const bundles = slots
    .map((day) => ({
      day,
      sessions: week.sessions.filter((session) => dayOf(session.date) === day),
    }))
    .filter((bundle) => bundle.sessions.length);
  if (bundles.length !== slots.length) return week;
  type Bundle = (typeof bundles)[number];
  type SearchState = { order: Bundle[]; remaining: Bundle[]; score: number };
  const preferred = new Set(preferredDays.filter((day) => day >= 0 && day < 7)),
    contains = (bundle: Bundle, predicate: (session: Session) => boolean) =>
      bundle.sessions.some(predicate);
  const hardValid = (order: Bundle[]) => {
    const at = (predicate: (session: Session) => boolean) =>
        order.flatMap((bundle, day) =>
          contains(bundle, predicate) ? [day] : [],
        ),
      runs = new Set(at((session) => kind(session.category) === "run")),
      bikes = new Set(at((session) => kind(session.category) === "bike"));
    const long = at((session) => session.category === "Long run")[0],
      legs = at(
        (session) =>
          session.category === "Lower-body strength" ||
          session.title === "Legs",
      )[0],
      core = at((session) => session.title === "Core")[0],
      arms = at((session) => session.title === "Arms")[0],
      chest = at((session) => session.title === "Chest & Triceps")[0],
      back = at((session) => session.title === "Back & Biceps")[0];
    if (
      (long !== undefined && long < 5) ||
      (core !== undefined && core >= 5) ||
      (long !== undefined && legs !== undefined && Math.abs(long - legs) < 3)
    )
      return false;
    if (
      arms !== undefined &&
      chest !== undefined &&
      back !== undefined &&
      arms > Math.min(chest, back) &&
      arms < Math.max(chest, back)
    )
      return false;
    for (let day = 0; day <= 4; day++)
      if (runs.has(day) && runs.has(day + 1) && runs.has(day + 2)) return false;
    if (
      Array.from(
        { length: 6 },
        (_, day) => runs.has(day) && runs.has(day + 1),
      ).filter(Boolean).length > 1
    )
      return false;
    for (let day = 0; day <= 5; day++)
      if (bikes.has(day) && bikes.has(day + 1)) return false;
    return true;
  };
  let states: SearchState[] = [{ order: [], remaining: bundles, score: 0 }];
  for (const day of slots) {
    const next: SearchState[] = [];
    for (const state of states)
      for (let index = 0; index < state.remaining.length; index++) {
        const bundle = state.remaining[index],
          count = bundle.sessions.length;
        if (
          bundle.sessions.some(
            (session) => session.locked || session.completed,
          ) &&
          bundle.day !== day
        )
          continue;
        if (wfhDays.includes(day) && (count < 2 || count > 3)) continue;
        if (day >= 5 && (count < 2 || count > 3)) continue;
        if (!isValidDayCombination(bundle.sessions, day, wfhDays)) continue;
        if (
          contains(bundle, (session) => session.category === "Long run") &&
          day < 5
        )
          continue;
        if (
          contains(bundle, (session) => session.title === "Core") &&
          (day >= 5 ||
            count !== 2 ||
            !contains(bundle, (session) => kind(session.category) === "run"))
        )
          continue;
        const order = [...state.order, bundle];
        if (!hardValid(order)) continue;
        const preference = preferred.size
          ? count > 1
            ? preferred.has(day)
              ? -8
              : 4
            : preferred.has(day)
              ? 2
              : 0
          : 0;
        next.push({
          order,
          remaining: [
            ...state.remaining.slice(0, index),
            ...state.remaining.slice(index + 1),
          ],
          score: state.score + Math.abs(day - bundle.day) + preference,
        });
      }
    states = next
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.order
            .map((bundle) => bundle.day)
            .join("")
            .localeCompare(b.order.map((bundle) => bundle.day).join("")),
      )
      .slice(0, 256);
    if (!states.length) return week;
  }
  const best = states.find((state) => hardValid(state.order));
  if (!best) return week;
  const sessions = week.sessions.map((session) => ({ ...session }));
  best.order.forEach((bundle, day) =>
    bundle.sessions.forEach((source) => {
      const target = sessions.find((session) => session.id === source.id);
      if (target) target.date = add(start, day);
    }),
  );
  return { ...week, sessions };
}
export function ensureWfhDoubles(
  week: TrainingWeek,
  wfhDays = week.planningContext?.wfhDays ?? [],
): TrainingWeek {
  const sessions = week.sessions.map((session) => ({ ...session })),
    start = parseDate(week.startDate),
    dateFor = (day: number) => add(start, day),
    items = (day: number) =>
      sessions.filter((session) => session.date === dateFor(day));
  for (const day of wfhDays) {
    while (items(day).length < 2) {
      const existing = items(day);
      const compatible = (session: Session) => {
        const combined = [...existing, session];
        return isValidDayCombination(combined, day, wfhDays);
      };
      const donor = sessions.find((session) => {
        const source = Math.round(
            (parseDate(session.date).getTime() - start.getTime()) / 86400000,
          ),
          minimum = source >= 5 || wfhDays.includes(source) ? 2 : 1;
        return (
          source !== day &&
          !session.completed &&
          !session.locked &&
          items(source).length > minimum &&
          compatible(session)
        );
      });
      if (donor) {
        donor.date = dateFor(day);
        continue;
      }
      if (existing.length === 0) {
        sessions.push({
          id: crypto.randomUUID(),
          date: dateFor(day),
          category: "Easy run",
          title: "WFH easy run",
          plannedDistanceKm: 4,
          intensity: "easy",
          completed: false,
          skipped: false,
        });
        continue;
      }
      const first = existing[0];
      if (kind(first.category) === "strength")
        sessions.push({
          id: crypto.randomUUID(),
          date: dateFor(day),
          category: "Easy run",
          title: "WFH easy run",
          plannedDistanceKm: 4,
          intensity: "easy",
          completed: false,
          skipped: false,
        });
      else if (
        kind(first.category) === "run" ||
        kind(first.category) === "bike"
      )
        sessions.push({
          id: crypto.randomUUID(),
          date: dateFor(day),
          category: "Upper-body strength",
          title: "WFH strength",
          plannedDurationMinutes: 35,
          intensity: "moderate",
          completed: false,
          skipped: false,
        });
      else break;
    }
  }
  return {
    ...week,
    sessions,
    planningContext: { ...(week.planningContext ?? { wfhDays }), wfhDays },
  };
}
export function applyWeeklyTargets(
  week: TrainingWeek,
  goals?: import("./types").TrainingGoals,
): TrainingWeek {
  if (!goals) return week;
  let sessions = week.sessions.map((session) => ({ ...session }));
  const minimum = 9 + (week.planningContext?.wfhDays.length ?? 0),
    requested = Math.max(
      minimum,
      Math.min(14, Math.round(goals.workoutSessions ?? sessions.length)),
    );
  const active = () => sessions;
  const removable = () =>
    sessions
      .filter((session) => {
        const day = Math.round(
          (parseDate(session.date).getTime() -
            parseDate(week.startDate).getTime()) /
            86400000,
        );
        return (
          kind(session.category) === "strength" &&
          !session.completed &&
          !session.locked &&
          day < 5 &&
          !week.planningContext?.wfhDays.includes(day) &&
          sessions.filter((item) => item.date === session.date).length > 1
        );
      })
      .sort(
        (a, b) => (a.title === "Core" ? 1 : 0) - (b.title === "Core" ? 1 : 0),
      );
  while (active().length > requested && removable().length)
    sessions = sessions.filter((session) => session.id !== removable()[0].id);
  while (active().length < requested) {
    const days = Array.from({ length: 7 }, (_, day) => ({
      day,
      date: add(parseDate(week.startDate), day),
      items: sessions.filter(
        (session) => session.date === add(parseDate(week.startDate), day),
      ),
    }));
    const priority = [
      ...new Set([
        5,
        6,
        ...(week.planningContext?.wfhDays ?? []),
        ...(goals.workoutDays ?? []),
        0,
        1,
        2,
        3,
        4,
      ]),
    ];
    const candidate = priority
      .map((day) => days[day])
      .find((item) => {
        const multiDay =
          item.day >= 5 ||
          Boolean(week.planningContext?.wfhDays.includes(item.day));
        if (
          !multiDay ||
          item.items.length >= 3 ||
          item.items.some((session) => session.category === "Speed work")
        )
          return false;
        const missing = (["strength", "bike", "run"] as const).find(
          (type) =>
            !item.items.some((session) => kind(session.category) === type),
        );
        if (!missing) return false;
        const proposed: Session =
          missing === "strength"
            ? {
                id: "candidate",
                date: item.date,
                category: "Upper-body strength",
                title: "Supplemental strength",
                plannedDurationMinutes: 35,
                intensity: "moderate",
                completed: false,
                skipped: false,
              }
            : missing === "bike"
              ? {
                  id: "candidate",
                  date: item.date,
                  category: "Indoor bike",
                  title: "Supplemental easy ride",
                  plannedDistanceKm: 15,
                  intensity: "easy",
                  completed: false,
                  skipped: false,
                }
              : {
                  id: "candidate",
                  date: item.date,
                  category: "Easy run",
                  title: "Supplemental easy run",
                  plannedDistanceKm: 4,
                  intensity: "easy",
                  completed: false,
                  skipped: false,
                };
        if (missing === "run") {
          const runDays = new Set(
            sessions
              .filter((session) => kind(session.category) === "run")
              .map((session) =>
                Math.round(
                  (parseDate(session.date).getTime() -
                    parseDate(week.startDate).getTime()) /
                    86400000,
                ),
              ),
          );
          runDays.add(item.day);
          for (let day = 0; day <= 4; day++)
            if (
              runDays.has(day) &&
              runDays.has(day + 1) &&
              runDays.has(day + 2)
            )
              return false;
        }
        if (
          missing === "bike" &&
          sessions.some(
            (session) =>
              kind(session.category) === "bike" &&
              Math.abs(
                Math.round(
                  (parseDate(session.date).getTime() -
                    parseDate(week.startDate).getTime()) /
                    86400000,
                ) - item.day,
              ) === 1,
          )
        )
          return false;
        return isValidDayCombination(
          [...item.items, proposed],
          item.day,
          week.planningContext?.wfhDays ?? [],
        );
      });
    if (!candidate) break;
    const missing = (["strength", "bike", "run"] as const).find(
      (type) =>
        !candidate.items.some((session) => kind(session.category) === type),
    );
    if (missing === "strength")
      sessions.push({
        id: crypto.randomUUID(),
        date: candidate.date,
        category: "Upper-body strength",
        title: "Supplemental strength",
        plannedDurationMinutes: 35,
        intensity: "moderate",
        completed: false,
        skipped: false,
      });
    else if (missing === "bike")
      sessions.push({
        id: crypto.randomUUID(),
        date: candidate.date,
        category: "Indoor bike",
        title: "Supplemental easy ride",
        plannedDistanceKm: 15,
        intensity: "easy",
        completed: false,
        skipped: false,
      });
    else if (missing === "run")
      sessions.push({
        id: crypto.randomUUID(),
        date: candidate.date,
        category: "Easy run",
        title: "Supplemental easy run",
        plannedDistanceKm: 4,
        intensity: "easy",
        completed: false,
        skipped: false,
      });
    else break;
  }
  const scale = (items: Session[], target?: number) => {
    if (target === undefined || !items.length) return;
    const fixed = items.filter((item) => item.completed || item.locked),
      editable = items.filter((item) => !item.completed && !item.locked),
      fixedKm = fixed.reduce(
        (sum, item) =>
          sum + (item.plannedDistanceKm ?? item.actualDistanceKm ?? 0),
        0,
      ),
      remaining = Math.max(0, Math.round((target - fixedKm) * 10) / 10);
    if (!editable.length) return;
    const running = editable.every((item) => kind(item.category) === "run"),
      cycling = editable.every((item) => kind(item.category) === "bike"),
      easyCount = editable.filter(
        (item) =>
          kind(item.category) === "run" &&
          item.category !== "Long run" &&
          item.category !== "Speed work",
      ).length,
      speedCount = editable.filter(
        (item) => item.category === "Speed work",
      ).length,
      weights = editable.map((item) =>
        running
          ? item.category === "Long run"
            ? 0.45
            : item.category === "Speed work"
              ? 0.2
              : (speedCount ? 0.35 : 0.55) / Math.max(1, easyCount)
          : (item.plannedDistanceKm ?? item.plannedDurationMinutes ?? 1),
      ),
      total = weights.reduce((sum, value) => sum + value, 0);
    if (running || cycling) {
      const wholeTarget = Math.abs(remaining - Math.round(remaining)) < 0.001,
        halfTarget =
          Math.abs(remaining * 2 - Math.round(remaining * 2)) < 0.001,
        fiveTarget =
          cycling &&
          Math.abs(remaining / 5 - Math.round(remaining / 5)) < 0.001,
        twoTarget =
          cycling &&
          Math.abs(remaining / 2 - Math.round(remaining / 2)) < 0.001,
        step = fiveTarget
          ? 5
          : twoTarget
            ? 2
            : wholeTarget
              ? 1
              : halfTarget
                ? 0.5
                : 0.1,
        raw = weights.map((weight) => (remaining * weight) / total),
        values = raw.map((value) =>
          running
            ? Math.floor((value + 0.0001) / step) * step
            : Math.round(value / step) * step,
        ),
        ranked = raw
          .map((value, index) => ({
            index,
            remainder: value - values[index],
            long: editable[index].category === "Long run",
          }))
          .sort(
            (a, b) =>
              b.remainder - a.remainder || Number(b.long) - Number(a.long),
          );
      let units = Math.round(
        (remaining - values.reduce((sum, value) => sum + value, 0)) / step,
      );
      for (let index = 0; units > 0; index++, units--)
        values[ranked[index % ranked.length].index] += step;
      const overallocated = raw
        .map((value, index) => ({
          index,
          excess: values[index] - value,
        }))
        .sort((a, b) => b.excess - a.excess);
      for (let index = 0; units < 0; index++, units++)
        values[overallocated[index % overallocated.length].index] -= step;
      editable.forEach((item, index) => {
        item.plannedDistanceKm =
          Math.round(Math.max(0, values[index]) * 10) / 10;
      });
    } else {
      let used = 0;
      editable.forEach((item, index) => {
        const value =
          index === editable.length - 1
            ? Math.max(0, Math.round((remaining - used) * 10) / 10)
            : Math.round(((remaining * weights[index]) / total) * 10) / 10;
        item.plannedDistanceKm = value;
        used = Math.round((used + value) * 10) / 10;
      });
    }
  };
  scale(
    sessions.filter((session) => kind(session.category) === "run"),
    goals.weeklyRunKm,
  );
  scale(
    sessions.filter((session) => kind(session.category) === "bike"),
    goals.weeklyCycleKm,
  );
  const run = sessions
      .filter((session) => kind(session.category) === "run")
      .reduce((sum, item) => sum + (item.plannedDistanceKm ?? 0), 0),
    bike = sessions
      .filter((session) => kind(session.category) === "bike")
      .reduce((sum, item) => sum + (item.plannedDistanceKm ?? 0), 0);
  const appliedTotal = active().length;
  const targetLine =
    `Targets applied: ${run.toFixed(1)} km running, ${bike.toFixed(1)} km cycling and ${appliedTotal} workouts.` +
    (appliedTotal < requested
      ? ` The requested ${requested} sessions could not fit without breaking a hard scheduling rule.`
      : "");
  return balanceEnduranceDays(
    ensureWfhDoubles({
      ...week,
      targets: { ...goals, workoutSessions: appliedTotal },
      sessions,
      generationExplanation: [
        targetLine,
        ...(week.generationExplanation ?? []).filter(
          (item) => !item.startsWith("Targets applied:"),
        ),
      ],
    }),
    week.planningContext?.wfhDays ?? [],
    goals.workoutDays,
  );
}
export function closeElapsedDays(
  generated: TrainingWeek,
  current: TrainingWeek,
  today = iso(new Date()),
): TrainingWeek {
  const weekEnd = add(parseDate(generated.startDate), 6);
  if (today < generated.startDate || today > weekEnd) return generated;
  const completedToday = current.sessions.some(
    (session) =>
      session.date === today && session.completed && !session.skipped,
  );
  const elapsedSessions = current.sessions.filter(
      (session) => session.date < today,
    ),
    protectedToday = completedToday
      ? current.sessions.filter(
          (session) =>
            session.date === today && (session.completed || session.locked),
        )
      : [],
    preserved = [...elapsedSessions, ...protectedToday],
    preservedIds = new Set(preserved.map((session) => session.id));
  const sessions = [
    ...generated.sessions.filter(
      (session) =>
        session.date >= today &&
        (!completedToday || session.date !== today) &&
        !preservedIds.has(session.id),
    ),
    ...preserved.map((session) => ({ ...session })),
  ];
  const pastNote =
      "Past days were left exactly as recorded during regeneration.",
    todayNote =
      "Today was left closed because a completed activity already exists.",
    notes = [pastNote, ...(completedToday ? [todayNote] : [])];
  return {
    ...generated,
    sessions,
    generationExplanation: [
      ...(generated.generationExplanation ?? []).filter(
        (item) => item !== pastNote && item !== todayNote,
      ),
      ...notes,
    ],
  };
}
export function buildGeneratedWeek(
  start: Date,
  wfhDays: number[],
  includeSpeedWork: boolean,
  goals: import("./types").TrainingGoals | undefined,
  current?: TrainingWeek,
  today = iso(new Date()),
  includeLegDay = true,
): TrainingWeek {
  const base = makeWfhWeek(start, wfhDays, includeSpeedWork, includeLegDay);
  const protectedBase = current ? preserveLockedSessions(base, current) : base;
  const generated = applyWeeklyTargets(
    {
      ...protectedBase,
      planningContext: {
        ...(protectedBase.planningContext ?? {}),
        wfhDays,
        includeLegDay,
      },
    },
    goals,
  );
  return current ? closeElapsedDays(generated, current, today) : generated;
}
export function getFatigueWarnings(
  week: TrainingWeek,
  weeks: TrainingWeek[],
): FatigueWarning[] {
  const warnings: FatigueWarning[] = [],
    active = week.sessions.filter((session) => !session.skipped);
  const dayIndex = (date: string) =>
    Math.round(
      (parseDate(date).getTime() - parseDate(week.startDate).getTime()) /
        86400000,
    );
  const dayName = (date: string) =>
    parseDate(date).toLocaleDateString("en-GB", { weekday: "short" });
  const hardByDay = new Map<number, Session[]>();
  for (const session of active.filter((item) => item.intensity === "hard")) {
    const index = dayIndex(session.date);
    hardByDay.set(index, [...(hardByDay.get(index) ?? []), session]);
  }
  for (const [index, sessions] of [...hardByDay].sort((a, b) => a[0] - b[0])) {
    if (sessions.length > 1)
      warnings.push({
        id: `hard-stack-${index}`,
        title: "Multiple hard sessions together",
        detail: `${sessions.map((session) => session.title).join(" and ")} are both marked hard on ${dayName(sessions[0].date)}.`,
        severity: "high",
      });
    const next = hardByDay.get(index + 1);
    if (next)
      warnings.push({
        id: `hard-days-${index}`,
        title: "Hard days are back to back",
        detail: `${sessions[0].title} on ${dayName(sessions[0].date)} is followed by ${next[0].title} on ${dayName(next[0].date)}.`,
        severity: "watch",
      });
  }
  const legs = active.filter(
    (session) =>
      session.category === "Lower-body strength" || session.title === "Legs",
  );
  const demandingRuns = active.filter(
    (session) =>
      kind(session.category) === "run" &&
      (session.category === "Speed work" ||
        session.category === "Long run" ||
        session.intensity === "hard"),
  );
  for (const leg of legs) {
    const nearby = demandingRuns.find(
      (run) => Math.abs(dayIndex(run.date) - dayIndex(leg.date)) < 3,
    );
    if (nearby)
      warnings.push({
        id: `legs-${leg.id}-${nearby.id}`,
        title: "Concentrated leg load",
        detail: `${leg.title} on ${dayName(leg.date)} is scheduled ${leg.date === nearby.date ? "with" : "next to"} ${nearby.title} on ${dayName(nearby.date)}.`,
        severity: leg.date === nearby.date ? "high" : "watch",
      });
  }
  const previous = [...weeks]
    .filter((item) => item.startDate < week.startDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const runKm = (item: TrainingWeek) =>
    item.sessions
      .filter((session) => kind(session.category) === "run" && !session.skipped)
      .reduce(
        (sum, session) =>
          sum + (session.actualDistanceKm ?? session.plannedDistanceKm ?? 0),
        0,
      );
  if (previous) {
    const currentKm = runKm(week),
      previousKm = runKm(previous);
    if (previousKm >= 5 && currentKm > previousKm * 1.2) {
      const increase = Math.round((currentKm / previousKm - 1) * 100);
      warnings.push({
        id: "run-volume",
        title: "Running volume has jumped",
        detail: `This week is ${currentKm.toFixed(1)} km, ${increase}% above the previous week's ${previousKm.toFixed(1)} km.`,
        severity: increase >= 35 ? "high" : "watch",
      });
    }
  }
  return warnings;
}
export function cloneSession(session: Session, date = session.date): Session {
  return {
    ...session,
    id: crypto.randomUUID(),
    date,
    completed: false,
    skipped: false,
    actualDurationMinutes: undefined,
    actualDistanceKm: undefined,
    perceivedEffort: undefined,
    notes: undefined,
    locked: false,
    exercises: session.exercises?.map((exercise) => ({
      ...exercise,
      id: crypto.randomUUID(),
      completed: false,
    })),
  };
}
export function copyWeekToStart(
  source: TrainingWeek,
  target: TrainingWeek,
): TrainingWeek {
  const sourceStart = parseDate(source.startDate),
    targetStart = parseDate(target.startDate),
    sessions = source.sessions.map((session) => {
      const offset = Math.round(
        (parseDate(session.date).getTime() - sourceStart.getTime()) / 86400000,
      );
      return cloneSession(session, add(targetStart, offset));
    });
  return { ...target, sessions, generationExplanation: undefined };
}
export function repeatSessionAcrossWeeks(
  weeks: TrainingWeek[],
  sourceWeek: TrainingWeek,
  session: Session,
  count: number,
): TrainingWeek[] {
  let result = [...weeks];
  for (let offset = 1; offset <= count; offset++) {
    const start = add(parseDate(sourceWeek.startDate), offset * 7),
      date = add(parseDate(session.date), offset * 7),
      existing = result.find((week) => week.startDate === start),
      week = existing ?? makeWeek(parseDate(start));
    if (
      !week.sessions.some(
        (item) =>
          item.date === date &&
          item.title === session.title &&
          item.category === session.category,
      )
    ) {
      const updated = {
        ...week,
        sessions: [...week.sessions, cloneSession(session, date)],
        replacedAt: new Date().toISOString(),
      };
      result = replaceCalendarWeek(result, updated);
    } else if (result.filter((item) => item.startDate === start).length > 1)
      result = replaceCalendarWeek(result, week);
  }
  return result.sort((a, b) => a.startDate.localeCompare(b.startDate));
}
export function replaceCalendarWeek(
  weeks: TrainingWeek[],
  replacement: TrainingWeek,
): TrainingWeek[] {
  return [
    ...weeks.filter((week) => week.startDate !== replacement.startDate),
    replacement,
  ].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
export function preserveLockedSessions(
  generated: TrainingWeek,
  current: TrainingWeek,
): TrainingWeek {
  const sessions = [...generated.sessions];
  const protectedSessions = current.sessions.filter(
      (session) => session.locked || session.completed,
    ),
    seen = new Set<string>(),
    preserved = protectedSessions.filter((session) => {
      const key = session.stravaActivityId
        ? `strava|${session.stravaActivityId}`
        : `${session.date}|${session.category}|${session.title.trim().replace(/\s+/g, " ").toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  for (const protectedSession of preserved) {
    let match = sessions.findIndex(
      (session) =>
        session.title === protectedSession.title &&
        session.category === protectedSession.category,
    );
    if (match < 0)
      match = sessions.findIndex(
        (session) => session.category === protectedSession.category,
      );
    if (match >= 0) sessions.splice(match, 1);
    sessions.push({ ...protectedSession });
  }
  const explanation = preserved.length
    ? [
        `${preserved.length} completed or locked session${preserved.length === 1 ? " was" : "s were"} kept on ${preserved.length === 1 ? "its" : "their"} existing date${preserved.length === 1 ? "" : "s"}.`,
      ]
    : [];
  return {
    ...generated,
    id: current.id,
    sessions,
    generationExplanation: [
      ...(generated.generationExplanation ?? []),
      ...explanation,
    ],
  };
}
const parseDate = (value: string) => new Date(value + "T12:00:00");
function workoutOrder(session: Session) {
  if (session.category === "Speed work") return -1;
  if (session.title === "Core") return 0;
  if (session.title === "Arms") return 1;
  if (session.title === "Chest & Triceps") return 2;
  if (session.title === "Back & Biceps") return 3;
  if (session.category === "Indoor bike") return 4;
  if (session.category === "Lower-body strength") return 5;
  if (session.category === "Easy run") return 6;
  return 7;
}
function scoreDay(
  day: number,
  session: Session,
  wfhDays: number[],
  counts: number[],
  runDays: Set<number>,
  upperFatigueDays: Set<number>,
) {
  const priority =
    wfhDays.includes(day) && counts[day] < 2
      ? -30
      : day >= 5 && counts[day] < 2
        ? -18
        : 0;
  let score = counts[day] * 5 + priority;
  if (session.title === "Core")
    score += day < 5 ? (wfhDays.includes(day) ? -70 : -45) : 90;
  if (session.title === "Arms") score += day === 0 ? -60 : day === 6 ? -30 : 50;
  if (session.category === "Speed work")
    score +=
      (counts[day] > 0 ? 120 : 0) +
      (day < 5 && !wfhDays.includes(day) ? -80 : 50);
  else if (
    kind(session.category) === "run" &&
    day < 5 &&
    !wfhDays.includes(day)
  )
    score += 50;
  if (
    session.category !== "Speed work" &&
    kind(session.category) === "run" &&
    counts[day] > 0
  )
    score += 25;
  if (kind(session.category) === "run" && runDays.has(day)) score += 30;
  if (
    kind(session.category) === "strength" &&
    day < 5 &&
    !wfhDays.includes(day) &&
    runDays.has(day)
  )
    score += 14;
  if (session.title === "Arms") {
    const before = upperFatigueDays.has(day - 1),
      after = upperFatigueDays.has(day + 1);
    score += before && after ? 60 : before || after ? 10 : 0;
  }
  if (session.category === "Lower-body strength")
    score += Math.abs(day - 2) * 28;
  if (session.category === "Indoor bike" && runDays.has(day)) score += 10;
  return score;
}
