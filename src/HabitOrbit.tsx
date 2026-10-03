import { useMemo, useState, type CSSProperties } from "react";
import { Check, Sparkles } from "lucide-react";
import { iso } from "./data";
import type { Habit } from "./types";

const parse = (value: string) => new Date(`${value}T12:00:00`);
const shift = (value: string, amount: number) => {
  const date = parse(value);
  date.setDate(date.getDate() + amount);
  return iso(date);
};
const label = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const wheelBackground = (habits: Habit[]) => {
  const highlight =
    "radial-gradient(circle at center, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 65%)";

  if (!habits.length) return "var(--soft)";
  if (habits.length === 1)
    return `${highlight}, linear-gradient(${habits[0].color}, ${habits[0].color})`;

  const rotation = -(180 / habits.length),
    stops = habits.map(
      (habit, index) => `${habit.color} ${(index / habits.length) * 100}%`,
    );
  stops.push(`${habits[0].color} 100%`);

  return `${highlight}, conic-gradient(from ${rotation}deg, ${stops.join(", ")})`;
};

export default function HabitOrbit({ habits }: { habits: Habit[] }) {
  const today = iso(new Date());
  const [selectedIds, setSelectedIds] = useState<string[]>([]),
    [activeDate, setActiveDate] = useState(today);
  const selectedHabits = selectedIds.length
      ? habits.filter((habit) => selectedIds.includes(habit.id))
      : habits,
    selected = selectedHabits.length === 1 ? selectedHabits[0] : undefined,
    showingAll = selectedIds.length === 0,
    showingMultiple = selectedHabits.length > 1,
    color = selected?.color ?? "#84cc16";
  const days = useMemo(() => {
    const weekday = (parse(today).getDay() + 6) % 7;
    const start = shift(today, -(28 + weekday));

    return Array.from({ length: 35 }, (_, index) => shift(start, index));
  }, [today]);
  const values = days.map((date) => {
    const future = date > today,
      completedHabits = future
        ? []
        : selectedHabits.filter((habit) => habit.completedDates.includes(date)),
      completed = completedHabits.length;
    return {
      date,
      completed,
      completedHabits,
      future,
      total: future ? 0 : selectedHabits.length,
      rate:
        !future && selectedHabits.length
          ? completed / selectedHabits.length
          : 0,
    };
  });
  const completed = values.reduce((sum, day) => sum + day.completed, 0),
    possible = values.reduce((sum, day) => sum + day.total, 0),
    percentage = possible ? Math.round((completed / possible) * 100) : 0;
  const active =
      values.find((day) => day.date === activeDate) ??
      values.find((day) => day.date === today)!,
    weeks = Array.from({ length: 5 }, (_, index) =>
      values.slice(index * 7, index * 7 + 7),
    );
  return (
    <section
      className="panel habit-orbit"
      style={{ "--orbit-color": color } as CSSProperties}
    >
      <header className="habit-orbit-head">
        <div>
          <p className="eyebrow">HABIT SIGNAL</p>
          <h2 className="section-title">Your five-week rhythm</h2>
        </div>
        <div className="habit-orbit-score">
          <Sparkles size={16} />
          <strong>{percentage}%</strong>
          <span>complete</span>
        </div>
      </header>
      <div
        className="habit-orbit-filters"
        role="group"
        aria-label="Choose habit to visualize"
      >
        <button
          className={showingAll ? "active" : ""}
          aria-pressed={showingAll}
          onClick={() => setSelectedIds([])}
        >
          All habits
        </button>
        {habits.map((habit) => (
          <button
            key={habit.id}
            className={selectedIds.includes(habit.id) ? "active" : ""}
            aria-pressed={selectedIds.includes(habit.id)}
            style={{ "--chip-color": habit.color } as CSSProperties}
            onClick={() =>
              setSelectedIds((current) =>
                current.includes(habit.id)
                  ? current.filter((id) => id !== habit.id)
                  : [...current, habit.id],
              )
            }
          >
            {habit.name}
          </button>
        ))}
      </div>
      <div className="habit-signal-layout">
        <div
          className="habit-signal"
          role="grid"
          aria-label="Five weeks of habit completion by weekday"
        >
          <div className="habit-signal-weekdays" aria-hidden="true">
            <span />
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday.slice(0, 1)}</span>
            ))}
          </div>
          {weeks.map((week, weekIndex) => {
            const weekCompleted = week.reduce(
                (sum, day) => sum + day.completed,
                0,
              ),
              weekPossible = week.reduce((sum, day) => sum + day.total, 0),
              weekPercentage = weekPossible
                ? Math.round((weekCompleted / weekPossible) * 100)
                : 0;
            return (
              <div className="habit-signal-row" role="row" key={week[0].date}>
                <div
                  className="habit-signal-week"
                  title={
                    label.format(parse(week[0].date)) +
                    " to " +
                    label.format(parse(week[6].date))
                  }
                >
                  <span>{"W" + (weekIndex + 1)}</span>
                  <small>{weekPercentage}%</small>
                  <i
                    style={
                      {
                        "--week-progress": weekPercentage + "%",
                      } as CSSProperties
                    }
                  />
                </div>
                {week.map((day) => {
                  const isActive = day.date === active.date;
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      className={
                        "habit-signal-day " +
                        (isActive ? "active " : "") +
                        (day.future ? "future" : "")
                      }
                      disabled={day.future}
                      aria-label={
                        day.future
                          ? label.format(parse(day.date)) + ": future day"
                          : label.format(parse(day.date)) +
                            ": " +
                            day.completed +
                            " of " +
                            day.total +
                            " completed"
                      }
                      aria-pressed={isActive}
                      key={day.date}
                      onClick={() => setActiveDate(day.date)}
                    >
                      <span
                        className={
                          "habit-signal-bloom " +
                          (showingMultiple ? "multi " : "") +
                          (day.completed === 0 ? "empty" : "")
                        }
                        style={
                          {
                            "--signal-fill": showingMultiple
                              ? wheelBackground(day.completedHabits)
                              : (selected?.color ?? color),
                            "--signal-opacity":
                              !showingMultiple && day.completed === 0
                                ? 0.14
                                : 1,
                          } as CSSProperties
                        }
                      />
                      <small>{parse(day.date).getDate()}</small>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <aside className="habit-orbit-detail" aria-live="polite">
          <span>{label.format(parse(active.date))}</span>
          <strong>
            {active.completed} of {active.total}
          </strong>
          <p>
            {active.total && active.completed === active.total ? (
              <>
                <Check size={14} /> Everything completed
              </>
            ) : (
              `${active.total - active.completed} remaining`
            )}
          </p>
          <small>
            {showingAll
              ? "Across all habits"
              : selectedHabits.map((habit) => habit.name).join(" + ")}
          </small>
        </aside>
      </div>
    </section>
  );
}
