import { isValidDayCombination, kind } from "./data";
import type { RecoveryEntry, TrainingGoals, TrainingWeek } from "./types";

export interface TrainingWeekSummary {
  startDate: string;
  plannedSessions: number;
  completedSessions: number;
  skippedSessions: number;
  adherencePercent: number;
  plannedRunKm: number;
  completedRunKm: number;
  completedCycleKm: number;
  longestRunKm: number;
  hardSessions: number;
  completedStrengthSessions: number;
  averageEffort: number | null;
  totalElevationM?: number;
  averageRunHeartRate?: number | null;
  averageRidePowerWatts?: number | null;
  poweredRideCount?: number;
  activityTags?: string[];
  wfhDays: number[];
}
export interface AiWeekReview {
  trainingSummary: string;
  weeklyFocus: string;
  runDistanceMultiplier: number;
  cycleDistanceMultiplier: number;
  scheduleObservations: string[];
  targetFeedback: string[];
  availabilityTip: string;
  reviewModel?: string;
  cached?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  estimatedUsd?: number;
}

interface AiPlanRequest {
  draftWeek: TrainingWeek;
  trainingHistory: TrainingWeekSummary[];
  wfhDays: number[];
  includeSpeedWork: boolean;
  goals?: TrainingGoals;
  recovery?: RecoveryEntry[];
  previousWfhDays?: number[];
  token: string;
}

const finite = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;

export function summarizeTrainingHistory(
  weeks: TrainingWeek[],
  targetStart: string,
): TrainingWeekSummary[] {
  return [...weeks]
    .filter((week) => week.startDate < targetStart)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 4)
    .map((week) => {
      const sessions = week.sessions.filter(
          (session) => session.category !== "Walk or mobility",
        ),
        completed = sessions.filter(
          (session) => session.completed && !session.skipped,
        ),
        runs = sessions.filter((session) => kind(session.category) === "run"),
        completedRuns = completed.filter(
          (session) => kind(session.category) === "run",
        ),
        completedRides = completed.filter(
          (session) => kind(session.category) === "bike",
        ),
        efforts = completed
          .map((session) => session.perceivedEffort)
          .filter((value): value is number => typeof value === "number");
      const km = (items: typeof sessions) =>
        Math.round(
          items.reduce(
            (sum, session) =>
              sum +
              (session.actualDistanceKm ?? session.plannedDistanceKm ?? 0),
            0,
          ) * 10,
        ) / 10;
      return {
        startDate: week.startDate,
        plannedSessions: sessions.length,
        completedSessions: completed.length,
        skippedSessions: sessions.filter((session) => session.skipped).length,
        adherencePercent: sessions.length
          ? Math.round((completed.length / sessions.length) * 100)
          : 0,
        plannedRunKm: km(runs),
        completedRunKm: km(completedRuns),
        completedCycleKm: km(completedRides),
        longestRunKm:
          Math.round(
            Math.max(
              0,
              ...completedRuns.map(
                (session) =>
                  session.actualDistanceKm ?? session.plannedDistanceKm ?? 0,
              ),
            ) * 10,
          ) / 10,
        hardSessions: completed.filter(
          (session) => session.intensity === "hard",
        ).length,
        completedStrengthSessions: completed.filter(
          (session) => kind(session.category) === "strength",
        ).length,
        averageEffort: efforts.length
          ? Math.round(
              (efforts.reduce((sum, value) => sum + value, 0) /
                efforts.length) *
                10,
            ) / 10
          : null,
        totalElevationM: Math.round(completed.reduce((sum, session) => sum + (session.activityStats?.elevationGainM ?? 0), 0)),
        averageRunHeartRate: (() => { const values=completedRuns.flatMap(session=>session.activityStats?.averageHeartRate!==undefined?[session.activityStats.averageHeartRate]:[]); return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null })(),
        averageRidePowerWatts: (() => { const values=completedRides.flatMap(session=>session.activityStats?.averagePowerWatts!==undefined?[session.activityStats.averagePowerWatts]:[]); return values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):null })(),
        poweredRideCount: completedRides.filter(session=>session.activityStats?.averagePowerWatts!==undefined).length,
        activityTags: [...new Set(completed.flatMap(session=>session.activityTags??[]))].slice(0,8),
        wfhDays: week.planningContext?.wfhDays ?? [],
      };
    });
}
export function validateAiWeek(week: TrainingWeek): string[] {
  const errors: string[] = [],
    start = new Date(week.startDate + "T12:00:00"),
    ids = new Set<string>();
  const index = (date: string) =>
    Math.round(
      (new Date(date + "T12:00:00").getTime() - start.getTime()) / 86400000,
    );
  for (const session of week.sessions) {
    const day = index(session.date);
    if (day < 0 || day > 6)
      errors.push(`${session.title} is outside the target week.`);
    if (ids.has(session.id)) errors.push(`Duplicate session ID ${session.id}.`);
    ids.add(session.id);
  }
  for (let day = 0; day < 7; day++) {
    const sessions = week.sessions.filter(
        (session) => index(session.date) === day,
      ),
      active = sessions;
    if (!sessions.length) errors.push(`Day ${day} is empty.`);
    if (day >= 5 && (active.length < 2 || active.length > 3))
      errors.push(`Weekend day ${day} must have two or three active sessions.`);
    if (
      day < 5 &&
      week.planningContext?.wfhDays.includes(day) &&
      (active.length < 2 || active.length > 3)
    )
      errors.push(
        "WFH day " + day + " must have two or three active sessions.",
      );
    if (
      !isValidDayCombination(active, day, week.planningContext?.wfhDays ?? [])
    )
      errors.push(
        "Day " + day + " contains an incompatible or duplicate session type.",
      );
    if (active.filter((session) => kind(session.category) === "run").length > 1)
      errors.push("Day " + day + " has multiple running sessions.");
    if (
      active.filter((session) => kind(session.category) === "bike").length > 1
    )
      errors.push("Day " + day + " has multiple cycling sessions.");
    if (
      active.filter((session) => kind(session.category) === "strength").length >
      1
    )
      errors.push(`Day ${day} has multiple strength sessions.`);
    if (active.length >= 2) {
      const allowed = day >= 5 || week.planningContext?.wfhDays.includes(day);
      if (!allowed)
        errors.push("Office day " + day + " cannot contain multiple sessions.");
    }
    if (
      active.some((session) => session.category === "Speed work") &&
      active.length !== 1
    )
      errors.push(`Speed work on day ${day} is not standalone.`);
    if (
      active.some((session) => session.title === "Core") &&
      (day >= 5 ||
        (Boolean(week.planningContext?.wfhDays.length) &&
          (!week.planningContext?.wfhDays.includes(day) ||
            !active.some((session) => kind(session.category) === "run"))))
    )
      errors.push(
        `Core on day ${day} must be on a weekday and paired with a run when WFH availability permits.`,
      );
  }
  const runDays = new Set(
      week.sessions
        .filter((session) => kind(session.category) === "run")
        .map((session) => index(session.date)),
    ),
    bikeDays = new Set(
      week.sessions
        .filter((session) => kind(session.category) === "bike")
        .map((session) => index(session.date)),
    );
  for (let day = 0; day <= 4; day++)
    if (runDays.has(day) && runDays.has(day + 1) && runDays.has(day + 2))
      errors.push("Running cannot be scheduled on three consecutive days.");
  for (let day = 0; day <= 5; day++)
    if (bikeDays.has(day) && bikeDays.has(day + 1))
      errors.push("Cycling cannot be scheduled on consecutive days.");
  const longRun = week.sessions.find(
    (session) => session.category === "Long run",
  );
  if (longRun && index(longRun.date) < 5)
    errors.push("The long run must be on the weekend.");
  if (
    longRun &&
    week.sessions.some(
      (session) =>
        session.date === longRun.date && kind(session.category) === "bike",
    )
  )
    errors.push("The long run cannot share a day with cycling.");
  const legs = week.sessions.find(
    (session) =>
      session.category === "Lower-body strength" || session.title === "Legs",
  );
  if (longRun && legs && Math.abs(index(longRun.date) - index(legs.date)) < 3)
    errors.push(
      "Lower-body strength must be at least three days away from the long run.",
    );
  return [...new Set(errors)];
}

export function applyAiWeekReview(
  draft: TrainingWeek,
  review: AiWeekReview,
  goals?: TrainingGoals,
): TrainingWeek {
  if (
    !review ||
    !finite(review.runDistanceMultiplier, 0.8, 1.1) ||
    !finite(review.cycleDistanceMultiplier, 0.8, 1.1)
  )
    throw new Error("AI load adjustment was outside the safe range.");
  const runMultiplier =
    goals?.weeklyRunKm !== undefined ? 1 : review.runDistanceMultiplier;
  const cycleDistanceMultiplier =
    goals?.weeklyCycleKm !== undefined ? 1 : review.cycleDistanceMultiplier;
  const sessions = draft.sessions.map((session) => {
    const adapted = { ...session };
    if (kind(session.category) === "run" && session.plannedDistanceKm)
      adapted.plannedDistanceKm =
        Math.round(session.plannedDistanceKm * runMultiplier * 10) / 10;
    if (kind(session.category) === "bike" && session.plannedDistanceKm)
      adapted.plannedDistanceKm =
        Math.round(session.plannedDistanceKm * cycleDistanceMultiplier * 10) /
        10;
    return adapted;
  });
  const adapted = {
    ...draft,
    sessions,
    generationExplanation: [
      `Fast coaching review${review.reviewModel ? ` (${review.reviewModel.replace(/^gpt-/, "")}${review.cached ? ", cached" : ""}${review.inputTokens !== undefined ? `, ${review.inputTokens + (review.outputTokens ?? 0)} tokens` : ""}${review.estimatedUsd !== undefined ? `, $${review.estimatedUsd.toFixed(4)}` : ""})` : ""}: ${review.trainingSummary}`,
      `Upcoming focus: ${review.weeklyFocus}`,
      ...review.scheduleObservations.slice(0, 5),
      ...(review.targetFeedback ?? [])
        .slice(0, 4)
        .map((item) => `Target feedback: ${item}`),
      `Availability: ${review.availabilityTip}`,
      `Distance adjustment: running ${Math.round(runMultiplier * 100)}%, cycling ${Math.round(cycleDistanceMultiplier * 100)}% of the base kilometres.${goals?.weeklyRunKm !== undefined || goals?.weeklyCycleKm !== undefined ? " Explicit targets remained fixed." : ""}`,
    ],
  };
  const errors = validateAiWeek(adapted);
  if (errors.length) throw new Error(errors[0]);
  return adapted;
}

export function aiReviewFingerprint(request:Omit<AiPlanRequest,'token'>):string {
  const draftWeek={...request.draftWeek,sessions:request.draftWeek.sessions.map(({id,...session})=>session)}
  const source=JSON.stringify({draftWeek,trainingHistory:request.trainingHistory,wfhDays:request.wfhDays,includeSpeedWork:request.includeSpeedWork,goals:request.goals,recovery:request.recovery?.slice(-14),previousWfhDays:request.previousWfhDays})
  let hash=2166136261
  for(let index=0;index<source.length;index++){hash^=source.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return `v2-${(hash>>>0).toString(36)}`
}
export async function requestAiWeekReview(
  request: AiPlanRequest,
): Promise<AiWeekReview> {
  const draftWeek = {
    startDate: request.draftWeek.startDate,
    sessions: request.draftWeek.sessions.map((session) => ({
      id: session.id,
      date: session.date,
      title: session.title,
      category: session.category,
      intensity: session.intensity,
      completed: session.completed,
      skipped: session.skipped,
      locked: session.locked,
      plannedDurationMinutes: session.plannedDurationMinutes,
      plannedDistanceKm: session.plannedDistanceKm,
      actualDurationMinutes: session.actualDurationMinutes,
      actualDistanceKm: session.actualDistanceKm,
      perceivedEffort: session.perceivedEffort,
      stravaActivityId: session.stravaActivityId,
      activityTags: session.activityTags,
      activityStats: session.activityStats,
    })),
  };
  const response = await fetch("/api/ai-week-plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.token}`,
    },
    body: JSON.stringify({
      draftWeek,
      trainingHistory: request.trainingHistory,
      wfhDays: request.wfhDays,
      includeSpeedWork: request.includeSpeedWork,
      goals: request.goals,
      recovery: request.recovery?.slice(-14),
      previousWfhDays: request.previousWfhDays,
    }),
  });
  const result = (await response.json().catch(() => ({
    error: "The planning server returned an invalid response.",
  }))) as AiWeekReview & { error?: string };
  if (!response.ok)
    throw new Error(result.error || `AI planning failed (${response.status}).`);
  return result;
}





