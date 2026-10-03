import { describe, expect, it } from "vitest";
import { buildGeneratedWeek, kind } from "./data";
import { validateAiWeek } from "./aiPlanner";
import type { TrainingWeek } from "./types";

const start = new Date("2026-08-24T12:00:00");
const weekdays = [0, 1, 2, 3, 4];
const wfhOptions: number[][] = [
  [],
  ...weekdays.map((day) => [day]),
  ...weekdays.flatMap((first, index) =>
    weekdays.slice(index + 1).map((second) => [first, second]),
  ),
];
const day = (week: TrainingWeek, date: string) =>
  Math.round(
    (new Date(date + "T12:00:00").getTime() -
      new Date(week.startDate + "T12:00:00").getTime()) /
      86400000,
  );
const shape = (week: TrainingWeek) =>
  week.sessions
    .map((session) => ({
      day: day(week, session.date),
      title: session.title,
      category: session.category,
      intensity: session.intensity,
      km: session.plannedDistanceKm,
      minutes: session.plannedDurationMinutes,
    }))
    .sort((a, b) => a.day - b.day || a.title.localeCompare(b.title));

function expectQuality(week: TrainingWeek, wfhDays: number[], speed: boolean) {
  expect(validateAiWeek(week)).toEqual([]);
  expect(new Set(week.sessions.map((session) => session.id)).size).toBe(
    week.sessions.length,
  );
  expect(
    week.sessions.every(
      (session) =>
        session.title.trim().length > 0 &&
        session.date >= week.startDate &&
        session.date <= "2026-08-30",
    ),
  ).toBe(true);
  expect(
    week.sessions.some(
      (session) =>
        session.category === "Rest" || session.category === "Walk or mobility",
    ),
  ).toBe(false);
  expect(
    week.sessions.filter((session) => kind(session.category) === "run"),
  ).toHaveLength(4);
  expect(
    week.sessions.filter((session) => kind(session.category) === "bike"),
  ).toHaveLength(2);
  const strengthCount = week.sessions.filter(
    (session) => kind(session.category) === "strength",
  ).length;
  expect(strengthCount).toBeGreaterThanOrEqual(4);
  expect(strengthCount).toBeLessThanOrEqual(5);
  const speedSessions = week.sessions.filter(
    (session) => session.category === "Speed work",
  );
  expect(speedSessions).toHaveLength(speed ? 1 : 0);
  if (speedSessions.length)
    expect(
      week.sessions.filter((session) => session.date === speedSessions[0].date),
    ).toHaveLength(1);
  const armsSession = week.sessions.find((session) => session.title === "Arms"),
    chestSession = week.sessions.find(
      (session) => session.title === "Chest & Triceps",
    ),
    backSession = week.sessions.find(
      (session) => session.title === "Back & Biceps",
    );
  if (armsSession && chestSession && backSession) {
    const arms = day(week, armsSession.date),
      chest = day(week, chestSession.date),
      back = day(week, backSession.date);
    expect(arms > Math.min(chest, back) && arms < Math.max(chest, back)).toBe(
      false,
    );
  }
  for (const selected of wfhDays) {
    const count = week.sessions.filter(
      (session) => day(week, session.date) === selected,
    ).length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(3);
  }
}

describe("generated week quality matrix", () => {
  it.each(
    wfhOptions.flatMap((wfhDays) =>
      [false, true].map((speed) => ({
        label: `WFH ${wfhDays.join(",") || "none"} / speed ${speed}`,
        wfhDays,
        speed,
      })),
    ),
  )("$label", ({ wfhDays, speed }) => {
    const week = buildGeneratedWeek(start, wfhDays, speed, {
      weeklyRunKm: 40,
      weeklyCycleKm: 60,
      workoutSessions: 11,
      workoutDays: [1, 3],
    });
    expectQuality(week, wfhDays, speed);
    expect(
      week.sessions
        .filter((session) => kind(session.category) === "run")
        .reduce((sum, session) => sum + (session.plannedDistanceKm ?? 0), 0),
    ).toBe(40);
    expect(
      week.sessions
        .filter((session) => kind(session.category) === "bike")
        .reduce((sum, session) => sum + (session.plannedDistanceKm ?? 0), 0),
    ).toBe(60);
    expect(
      shape(
        buildGeneratedWeek(start, wfhDays, speed, {
          weeklyRunKm: 40,
          weeklyCycleKm: 60,
          workoutSessions: 11,
          workoutDays: [1, 3],
        }),
      ),
    ).toEqual(shape(week));
    expect(
      week.generationExplanation?.filter((item) =>
        item.startsWith("Targets applied:"),
      ),
    ).toHaveLength(1);
  });
  it("preserves completed and locked evidence without mutating the source week", () => {
    const source = buildGeneratedWeek(start, [1, 3], false, {
        weeklyRunKm: 36,
        weeklyCycleKm: 50,
        workoutSessions: 11,
      }),
      snapshot = structuredClone(source),
      completed = {
        ...source.sessions[0],
        completed: true,
        actualDistanceKm: 7.4,
      },
      locked = { ...source.sessions[1], locked: true };
    const current = {
        ...source,
        sessions: [completed, locked, ...source.sessions.slice(2)],
      },
      result = buildGeneratedWeek(
        start,
        [0, 2],
        true,
        { weeklyRunKm: 40, weeklyCycleKm: 60, workoutSessions: 12 },
        current,
      );
    expect(result.sessions).toContainEqual(completed);
    expect(result.sessions).toContainEqual(locked);
    expect(source).toEqual(snapshot);
  });
});
