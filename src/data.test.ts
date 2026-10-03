import { describe, expect, it } from "vitest";
import {
  applyWeeklyTargets,
  buildGeneratedWeek,
  ensureWfhDoubles,
  isValidDayCombination,
  kind,
  makeWfhWeek,
  preserveLockedSessions,
  repeatSessionAcrossWeeks,
  replaceCalendarWeek,
} from "./data";
import type { TrainingWeek } from "./types";

const start = new Date("2026-08-03T12:00:00");
const day = (week: TrainingWeek, date: string) =>
  Math.round(
    (new Date(date + "T12:00:00").getTime() -
      new Date(week.startDate + "T12:00:00").getTime()) /
      86400000,
  );

function expectHardRules(week: TrainingWeek, wfhDays: number[]) {
  expect(
    week.sessions.filter(
      (session) =>
        session.category === "Rest" || session.category === "Walk or mobility",
    ),
  ).toHaveLength(0);
  const weekendCount = week.sessions.filter(
    (session) => day(week, session.date) >= 5 && session.category !== "Rest",
  ).length;
  expect(weekendCount).toBeGreaterThanOrEqual(4);
  expect(weekendCount).toBeLessThanOrEqual(6);
  expect(
    day(
      week,
      week.sessions.find((session) => session.category === "Long run")!.date,
    ),
  ).toBeGreaterThanOrEqual(5);
  const runDays = new Set(
      week.sessions
        .filter((session) => kind(session.category) === "run")
        .map((session) => day(week, session.date)),
    ),
    bikeDays = new Set(
      week.sessions
        .filter((session) => kind(session.category) === "bike")
        .map((session) => day(week, session.date)),
    );
  for (let index = 0; index <= 4; index++)
    expect(
      runDays.has(index) && runDays.has(index + 1) && runDays.has(index + 2),
      "Runs must not span days " + index + "-" + (index + 2),
    ).toBe(false);
  for (let index = 0; index <= 5; index++)
    expect(
      bikeDays.has(index) && bikeDays.has(index + 1),
      "Bikes must not be consecutive on " + index + "-" + (index + 1),
    ).toBe(false);
  for (let index = 0; index < 7; index++) {
    const sessions = week.sessions.filter(
      (session) => day(week, session.date) === index,
    );
    expect(
      sessions.length,
      "Day " + index + " must not be empty",
    ).toBeGreaterThan(0);
    expect(
      sessions.filter((session) => kind(session.category) === "strength")
        .length,
    ).toBeLessThanOrEqual(1);
    expect(
      sessions.filter((session) => kind(session.category) === "run").length,
    ).toBeLessThanOrEqual(1);
    expect(
      sessions.filter((session) => kind(session.category) === "bike").length,
    ).toBeLessThanOrEqual(1);
    if (sessions.some((session) => session.title === "Core")) {
      expect(index).toBeLessThan(5);
      if (wfhDays.includes(index)) {
        expect(sessions.length).toBeGreaterThanOrEqual(2);
        expect(
          sessions.some((session) => kind(session.category) === "run"),
        ).toBe(true);
      } else expect(sessions).toHaveLength(1);
    }
    const active = sessions.filter((session) => session.category !== "Rest");
    expect(active.length).toBeLessThanOrEqual(
      index >= 5 || wfhDays.includes(index) ? 3 : 1,
    );
    expect(isValidDayCombination(active, index, wfhDays)).toBe(true);
    if (wfhDays.includes(index))
      expect(
        active.length,
        `WFH day ${index} for [${wfhDays}]`,
      ).toBeGreaterThanOrEqual(2);
  }
}

describe("makeWfhWeek", () => {
  it.each([
    { wfhDays: [] },
    { wfhDays: [0] },
    { wfhDays: [1, 3] },
    { wfhDays: [0, 2] },
    { wfhDays: [2, 4] },
  ])("obeys hard scheduling rules for WFH days ", ({ wfhDays }) => {
    expectHardRules(makeWfhWeek(start, wfhDays), wfhDays);
  });

  it("builds the final deterministic week once while preserving protected sessions", () => {
    const current = makeWfhWeek(start, [1, 3], false),
      protectedSession = {
        ...current.sessions.find(
          (session) => session.title === "Chest & Triceps",
        )!,
        locked: true,
        date: "2026-08-04",
      };
    const result = buildGeneratedWeek(
      start,
      [0, 2],
      false,
      { weeklyRunKm: 32, weeklyCycleKm: 55, workoutSessions: 11 },
      { ...current, sessions: [protectedSession] },
    );
    expect(
      result.sessions.find((session) => session.id === protectedSession.id)
        ?.date,
    ).toBe(protectedSession.date);
    expect(
      result.generationExplanation?.filter((item) =>
        item.startsWith("Targets applied:"),
      ),
    ).toHaveLength(1);
    expect(
      result.sessions
        .filter((session) => kind(session.category) === "run")
        .reduce((sum, session) => sum + (session.plannedDistanceKm ?? 0), 0),
    ).toBe(32);
    expect(
      result.sessions
        .filter((session) => kind(session.category) === "bike")
        .reduce((sum, session) => sum + (session.plannedDistanceKm ?? 0), 0),
    ).toBe(55);
  });
  it("closes the current day when an activity has already been completed", () => {
    const current = makeWfhWeek(start, [1, 3], false),
      today = "2026-08-05",
      completed = {
        ...current.sessions[0],
        id: "completed-today",
        date: today,
        completed: true,
        actualDurationMinutes: 50,
      };
    const result = buildGeneratedWeek(
      start,
      [0, 2],
      false,
      { weeklyRunKm: 32, weeklyCycleKm: 55, workoutSessions: 11 },
      { ...current, sessions: [completed, ...current.sessions] },
      today,
    );
    const todaySessions = result.sessions.filter(
      (session) => session.date === today,
    );
    expect(todaySessions).toEqual([completed]);
    expect(result.generationExplanation).toContain(
      "Today was left closed because a completed activity already exists.",
    );
  });
  it("does not add sessions to elapsed days when regenerating mid-week", () => {
    const current = makeWfhWeek(start, [1, 3], false),
      monday = "2026-08-03",
      today = "2026-08-04",
      completedRide = {
        ...current.sessions.find(
          (session) => session.category === "Indoor bike",
        )!,
        id: "monday-completed-ride",
        date: monday,
        completed: true,
        actualDistanceKm: 32,
      },
      result = buildGeneratedWeek(
        start,
        [1, 3],
        false,
        { weeklyRunKm: 40, weeklyCycleKm: 80, workoutSessions: 11 },
        { ...current, sessions: [completedRide] },
        today,
      );
    expect(
      result.sessions.filter((session) => session.date === monday),
    ).toEqual([completedRide]);
    expect(result.generationExplanation).toContain(
      "Past days were left exactly as recorded during regeneration.",
    );
  });
  it("can exclude a dedicated leg day from the generated rotation", () => {
    const result = buildGeneratedWeek(
      start,
      [1, 3],
      false,
      { weeklyRunKm: 40, weeklyCycleKm: 80, workoutSessions: 11 },
      undefined,
      undefined,
      false,
    );
    expect(
      result.sessions.some(
        (session) =>
          session.category === "Lower-body strength" ||
          session.title === "Legs",
      ),
    ).toBe(false);
    expect(
      result.sessions
        .filter((session) => kind(session.category) === "run")
        .reduce((sum, session) => sum + (session.plannedDistanceKm ?? 0), 0),
    ).toBe(40);
    expect(
      result.sessions
        .filter((session) => kind(session.category) === "bike")
        .reduce((sum, session) => sum + (session.plannedDistanceKm ?? 0), 0),
    ).toBe(80);
    expect(result.planningContext?.includeLegDay).toBe(false);
  });
  it("applies exact weekly distance and workout targets", () => {
    const week = applyWeeklyTargets(makeWfhWeek(start, [1, 3]), {
      weeklyRunKm: 30,
      weeklyCycleKm: 50,
      workoutSessions: 10,
    });
    expect(
      week.sessions
        .filter((session) => kind(session.category) === "run")
        .reduce((sum, session) => sum + (session.plannedDistanceKm ?? 0), 0),
    ).toBe(30);
    const runs = week.sessions.filter(
      (session) => kind(session.category) === "run",
    );
    expect(
      runs.find((session) => session.category === "Long run")!
        .plannedDistanceKm,
    ).toBeGreaterThan(
      Math.max(
        ...runs
          .filter((session) => session.category !== "Long run")
          .map((session) => session.plannedDistanceKm ?? 0),
      ),
    );
    expect(
      week.sessions
        .filter((session) => kind(session.category) === "bike")
        .reduce((sum, session) => sum + (session.plannedDistanceKm ?? 0), 0),
    ).toBe(50);
    expect(
      week.sessions.filter((session) => session.category !== "Rest"),
    ).toHaveLength(11);
    expectHardRules(week, [1, 3]);
  });
  it("uses meaningful whole-kilometre run distances with a real long run", () => {
    const week = buildGeneratedWeek(start, [1, 3], false, {
        weeklyRunKm: 40,
        weeklyCycleKm: 80,
        workoutSessions: 11,
      }),
      distances = week.sessions
        .filter((session) => kind(session.category) === "run")
        .map((session) => session.plannedDistanceKm ?? 0)
        .sort((a, b) => a - b),
      longRun = week.sessions.find(
        (session) => session.category === "Long run",
      )!;
    expect(distances).toEqual([7, 7, 8, 18]);
    expect(longRun.plannedDistanceKm).toBe(18);
    expect(distances.reduce((sum, distance) => sum + distance, 0)).toBe(40);
    expect(distances.some((distance) => distance === 7.7)).toBe(false);
  });
  it("uses meaningful 2 km or 5 km increments for generated rides", () => {
    const week = buildGeneratedWeek(start, [1, 3], false, {
        weeklyRunKm: 40,
        weeklyCycleKm: 80,
        workoutSessions: 11,
      }),
      distances = week.sessions
        .filter((session) => kind(session.category) === "bike")
        .map((session) => session.plannedDistanceKm ?? 0)
        .sort((a, b) => a - b);
    expect(distances).toEqual([30, 50]);
    expect(distances.reduce((sum, distance) => sum + distance, 0)).toBe(80);
    expect(
      distances.every((distance) => distance % 2 === 0 || distance % 5 === 0),
    ).toBe(true);
  });
  it("uses three-session weekends when higher targets require them", () => {
    const week = applyWeeklyTargets(makeWfhWeek(start, [1, 3]), {
      weeklyRunKm: 35,
      weeklyCycleKm: 60,
      workoutSessions: 12,
    });
    expect(
      week.sessions.filter((session) => session.category !== "Rest"),
    ).toHaveLength(12);
    const weekendLoads = [5, 6].map(
      (index) =>
        week.sessions.filter(
          (session) =>
            day(week, session.date) === index && session.category !== "Rest",
        ).length,
    );
    expect(
      weekendLoads.reduce((sum, value) => sum + value, 0),
    ).toBeGreaterThanOrEqual(4);
    const triple = [1, 3, 5, 6]
      .map((index) =>
        week.sessions.filter((session) => day(week, session.date) === index),
      )
      .find((sessions) => sessions.length === 3);
    expect(triple).toBeDefined();
    expect(new Set(triple!.map((session) => kind(session.category))).size).toBe(
      3,
    );
    expectHardRules(week, [1, 3]);
  });
  it("restores a missing session on a stored WFH day without emptying another day", () => {
    const generated = makeWfhWeek(start, [1, 3]),
      thursday = generated.sessions.filter(
        (session) =>
          day(generated, session.date) === 3 && session.category !== "Rest",
      );
    const broken = {
      ...generated,
      sessions: generated.sessions.filter(
        (session) => session.id !== thursday[0].id,
      ),
    };
    const repaired = ensureWfhDoubles(broken, [1, 3]);
    expect(
      repaired.sessions.filter(
        (session) =>
          day(repaired, session.date) === 3 && session.category !== "Rest",
      ),
    ).toHaveLength(2);
    expectHardRules(repaired, [1, 3]);
  });

  it("measures every generated ride in kilometres rather than minutes", () => {
    const rides = makeWfhWeek(start, [1, 3]).sessions.filter(
      (session) => kind(session.category) === "bike",
    );
    expect(rides.length).toBeGreaterThan(0);
    expect(
      rides.every(
        (session) =>
          Boolean(session.plannedDistanceKm) &&
          session.plannedDurationMinutes === undefined,
      ),
    ).toBe(true);
  });
  it("keeps four easy runs and no speed work when speed work is disabled", () => {
    const week = makeWfhWeek(start, [1, 3], false);
    const runs = week.sessions.filter(
      (session) => kind(session.category) === "run",
    );
    expect(runs).toHaveLength(4);
    expect(runs.every((session) => session.intensity === "easy")).toBe(true);
    expect(
      week.sessions.some((session) => session.category === "Speed work"),
    ).toBe(false);
  });

  it("keeps weekend Arms short and easy", () => {
    const arms = makeWfhWeek(start, [1, 3], false).sessions.find(
      (session) => session.title === "Arms",
    )!;
    expect(arms.intensity).toBe("easy");
    expect(arms.plannedDurationMinutes).toBeLessThanOrEqual(30);
  });
  it("keeps hard Legs well clear of the weekend long run", () => {
    const week = makeWfhWeek(start, [1, 3], false),
      legs = week.sessions.find((session) => session.title === "Legs")!,
      longRun = week.sessions.find(
        (session) => session.category === "Long run",
      )!;
    expect(
      Math.abs(day(week, longRun.date) - day(week, legs.date)),
    ).toBeGreaterThanOrEqual(3);
    expect(day(week, legs.date)).toBeLessThan(5);
  });
  it("places Core on a weekday with a run", () => {
    const week = makeWfhWeek(start, [1, 3], false),
      core = week.sessions.find((session) => session.title === "Core")!,
      coreDay = day(week, core.date),
      sameDay = week.sessions.filter((session) => session.date === core.date);
    expect(coreDay).toBeLessThan(5);
    expect(sameDay.some((session) => kind(session.category) === "run")).toBe(
      true,
    );
    expect(sameDay.some((session) => kind(session.category) === "bike")).toBe(
      false,
    );
  });
  it("keeps speed work alone on its day", () => {
    const week = makeWfhWeek(start, [1, 3], true);
    const speed = week.sessions.find(
      (session) => session.category === "Speed work",
    )!;
    expect(
      week.sessions.filter((session) => session.date === speed.date),
    ).toHaveLength(1);
  });
  it("repeating into a duplicate target week leaves one authoritative week", () => {
    const source = makeWfhWeek(start, []),
      first = {
        ...makeWfhWeek(new Date("2026-08-10T12:00:00"), []),
        id: "first",
      },
      duplicate = { ...first, id: "duplicate" };
    const result = repeatSessionAcrossWeeks(
      [source, first, duplicate],
      source,
      source.sessions[0],
      1,
    );
    expect(
      result.filter((week) => week.startDate === "2026-08-10"),
    ).toHaveLength(1);
  });
  it("replaces every duplicate record for the same calendar week", () => {
    const first = makeWfhWeek(start, [1, 3]),
      duplicate = { ...makeWfhWeek(start, [0]), id: "duplicate" },
      replacement = { ...makeWfhWeek(start, [2]), id: "replacement" };
    const result = replaceCalendarWeek([first, duplicate], replacement);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(replacement);
  });
  it("deduplicates completed or locked sessions while generating", () => {
    const original = makeWfhWeek(start, [1, 3]),
      done = {
        ...original.sessions[0],
        id: "done",
        completed: true,
        stravaActivityId: "activity-1",
      },
      duplicate = { ...done, id: "duplicate", plannedDistanceKm: 999 };
    const result = preserveLockedSessions(makeWfhWeek(start, [0, 2]), {
      ...original,
      sessions: [done, duplicate],
    });
    expect(
      result.sessions.filter(
        (session) => session.stravaActivityId === "activity-1",
      ),
    ).toHaveLength(1);
  });
  it("replaces ordinary sessions but preserves completed and locked sessions", () => {
    const original = makeWfhWeek(start, [1, 3]);
    const completed = {
      ...original.sessions[0],
      id: "completed-session",
      title: "Completed activity",
      completed: true,
      actualDurationMinutes: 57,
    };
    const locked = {
      ...original.sessions[1],
      id: "locked-session",
      title: "Locked workout",
      locked: true,
    };
    const ordinary = {
      ...original.sessions[2],
      id: "ordinary-session",
      title: "Old unprotected workout",
    };
    const current = {
      ...original,
      id: "target-week",
      sessions: [completed, locked, ordinary],
    };
    const result = preserveLockedSessions(makeWfhWeek(start, [0, 2]), current);
    expect(result.id).toBe("target-week");
    expect(result.sessions).toContainEqual(completed);
    expect(result.sessions).toContainEqual(locked);
    expect(
      result.sessions.some((session) => session.id === "ordinary-session"),
    ).toBe(false);
  });
  it("places compatible doubles on preferred workout days", () => {
    const week = applyWeeklyTargets(makeWfhWeek(start, [], false), {
      workoutSessions: 11,
      workoutDays: [1, 3],
    });
    for (const preferred of [1, 3])
      expect(
        week.sessions.filter(
          (session) => day(week, session.date) === preferred,
        ),
      ).toHaveLength(1);
  });
});
