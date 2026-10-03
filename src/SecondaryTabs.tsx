import React, { useEffect, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Dumbbell,
  LogOut,
  Search,
  Moon,
  Mountain,
  Plus,
  Zap,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { User } from "firebase/auth";
import HabitOrbit from "./HabitOrbit";
import type { Habit, Session, TrainingWeek } from "./types";
import type { PlannerStore } from "./storage";
import { validateBackup, type AppTheme } from "./storage";
import { iso, kind, mondayOf } from "./data";
import ActivityTracking from "./ActivityTracking";
import { inspectPlannerStore } from "./plannerIntegrity";
import { workoutPresets } from "./presets";

const parse = (s: string) => new Date(s + "T12:00:00");
const plusDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});
const loadFirebase = () => import("./firebaseAuth");
const logIn = (email: string, password: string) =>
  loadFirebase().then((api) => api.logIn(email, password));
const register = (email: string, password: string) =>
  loadFirebase().then((api) => api.register(email, password));
const logOut = () => loadFirebase().then((api) => api.logOut());

type Props = {
  tab: "habits" | "history" | "settings";
  uiNext?: boolean;
  activityFocus?: string | null;
  onActivityFocusHandled?: () => void;
  habits: Habit[];
  setHabits: (habits: Habit[]) => void;
  weeks: TrainingWeek[];
  currentWeekId?: string;
  openWeek: (id: string) => void;
  copyWeek: (week: TrainingWeek) => void;
  store: PlannerStore;
  setStore: (fn: (store: PlannerStore) => PlannerStore) => void;
  user: User | null;
  syncMessage: string;
  status: React.ReactNode;
  setTheme: (theme: AppTheme) => void;
  restore: (store: PlannerStore) => Promise<void>;
  restoreWeek: (week: TrainingWeek) => Promise<void>;
  uploadDevice: () => Promise<void>;
  downloadCloud: () => Promise<void>;
  clear: () => void;
};
export default function SecondaryTabs(props: Props) {
  const [moreView,setMoreView]=useState<"home"|"history"|"library"|"settings">("home");
  useEffect(()=>{if(props.tab!=="settings")setMoreView("home")},[props.tab]);
  if (props.tab === "habits") return <HabitTracker habits={props.habits} setHabits={props.setHabits} />;
  if (props.tab === "history") return <HistoryHub {...props} />;
  if (props.uiNext) return <MoreHub props={props} view={moreView} setView={setMoreView}/>;
  return <SettingsView store={props.store} user={props.user} syncMessage={props.syncMessage} status={props.status} setTheme={props.setTheme} restore={props.restore} restoreWeek={props.restoreWeek} uploadDevice={props.uploadDevice} downloadCloud={props.downloadCloud} clear={props.clear}/>;
}
function MoreHub({props,view,setView}:{props:Props;view:"home"|"history"|"library"|"settings";setView:(value:"home"|"history"|"library"|"settings")=>void}){
 if(view==="history")return <><button className="ui-next-more-back" onClick={()=>setView("home")}><ArrowLeft size={16}/> More</button><History weeks={props.weeks} currentWeekId={props.currentWeekId} open={props.openWeek} copy={props.copyWeek}/></>;
 if(view==="library")return <><button className="ui-next-more-back" onClick={()=>setView("home")}><ArrowLeft size={16}/> More</button><section className="ui-next-library"><header><small>WORKOUT LIBRARY</small><h2>Reusable workouts</h2><p>Choose a familiar workout name when adding sessions to your plan.</p></header><div>{workoutPresets.map(preset=><article key={preset.name}><span><Dumbbell size={17}/></span><div><b>{preset.name}</b><small>{preset.category}</small></div></article>)}</div></section></>;
 if(view==="settings")return <><button className="ui-next-more-back" onClick={()=>setView("home")}><ArrowLeft size={16}/> More</button><SettingsView {...props}/></>;
 return <><section className="ui-next-more-intro"><span><SlidersHorizontal size={20}/></span><div><small>MORE</small><h2>Training tools and settings</h2><p>Review earlier plans, reuse workouts or manage this device.</p></div></section><section className="ui-next-more-menu"><button onClick={()=>setView("history")}><Archive size={19}/><div><b>Training history</b><span>Completed weeks and archived sessions</span></div><ChevronRight size={17}/></button><button onClick={()=>setView("library")}><Dumbbell size={19}/><div><b>Workout library</b><span>Reusable workout names and types</span></div><ChevronRight size={17}/></button><button onClick={()=>setView("settings")}><SlidersHorizontal size={19}/><div><b>Settings and data</b><span>Connections, appearance and backups</span></div><ChevronRight size={17}/></button></section></>;
}

function HabitTracker({
  habits,
  setHabits,
}: {
  habits: Habit[];
  setHabits: (habits: Habit[]) => void;
}) {
  const today = iso(new Date()),
    todayDate = parse(today),
    initialMonth = `${today.slice(0, 7)}-01`;
  const [monthStart, setMonthStart] = useState(initialMonth),
    [name, setName] = useState(""),
    [color, setColor] = useState("#f97316"),
    [selectedDay, setSelectedDay] = useState<string | null>(null);
  const colors = [
    "#14b8a6",
    "#3b82f6",
    "#8b5cf6",
    "#f97316",
    "#ec4899",
    "#eab308",
    "#22c55e",
    "#ef4444",
  ];
  const monthDate = parse(monthStart),
    calendarStart = new Date(monthDate);
  calendarStart.setDate(1 - ((monthDate.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) =>
      plusDays(iso(calendarStart), i),
    ),
    monthLabel = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
    }).format(monthDate);
  const changeMonth = (amount: number) => {
    const next = parse(monthStart);
    next.setMonth(next.getMonth() + amount);
    setMonthStart(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
    );
  };
  const toggle = (habit: Habit, date: string) =>
    setHabits(
      habits.map((item) =>
        item.id === habit.id
          ? {
              ...item,
              completedDates: item.completedDates.includes(date)
                ? item.completedDates.filter((day) => day !== date)
                : [...item.completedDates, date],
            }
          : item,
      ),
    );
  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setHabits([
      ...habits,
      { id: crypto.randomUUID(), name: trimmed, color, completedDates: [] },
    ]);
    setName("");
  };
  const remove = (habit: Habit) => {
    if (confirm(`Remove “${habit.name}” and its check-off history?`))
      setHabits(habits.filter((item) => item.id !== habit.id));
  };
  return (
    <div className="habit-tracker-page">
      <section className="habit-page-head mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">CONSISTENCY</p>
          <h1 className="font-display text-4xl font-bold">Habit tracker</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            A compact month view of all your training habits.
          </p>
        </div>
        <div className="habit-month-nav flex items-center gap-2">
          <button
            className="icon-btn"
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-40 text-center text-sm font-bold">
            {monthLabel}
          </div>
          <button
            className="icon-btn"
            aria-label="Next month"
            onClick={() => changeMonth(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>
      {habits.length > 0 && <HabitOrbit habits={habits} />}
      <section className="panel habit-calendar-wrap">
        <div className="habit-legend">
          {habits.map((habit) => (
            <div className="habit-legend-item" key={habit.id}>
              <span style={{ backgroundColor: habit.color }} />
              <b>{habit.name}</b>
              <button
                aria-label={`Remove ${habit.name}`}
                onClick={() => remove(habit)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        {habits.length ? (
          <>
            <div className="habit-weekdays">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="habit-calendar">
              {days.map((day) => {
                const inMonth = day.slice(0, 7) === monthStart.slice(0, 7);
                return (
                  <article
                    key={day}
                    className={`habit-day ${inMonth ? "" : "outside"} ${day === today ? "today-date" : ""}`}
                  >
                    <button
                      className="habit-day-open"
                      aria-label={`Open habits for ${day}`}
                      onClick={() => setSelectedDay(day)}
                    />
                    <span className="habit-date">{parse(day).getDate()}</span>
                    <div className="habit-dots">
                      {habits.map((habit) => {
                        const done = habit.completedDates.includes(day);
                        return (
                          <button
                            key={habit.id}
                            title={`${habit.name} – ${day}`}
                            aria-label={`${done ? "Untick" : "Tick"} ${habit.name} on ${day}`}
                            className={`habit-dot ${done ? "done" : ""}`}
                            style={
                              {
                                "--habit-color": habit.color,
                              } as React.CSSProperties
                            }
                            onClick={() => toggle(habit, day)}
                          >
                            {done && <Check size={12} />}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <span>
              <Check size={20} />
            </span>
            <div>
              <b>No habits yet</b>
              <p>Add one habit to start building a simple daily streak.</p>
            </div>
            <button
              className="secondary"
              onClick={() =>
                document.getElementById("habit-name-input")?.focus()
              }
            >
              <Plus size={14} /> Add a habit
            </button>
          </div>
        )}
      </section>
      {selectedDay && (
        <div
          className="modal-bg habit-day-overlay"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelectedDay(null)
          }
        >
          <div className="modal habit-day-sheet">
            <div className="habit-sheet-head">
              <div>
                <p className="eyebrow">HABITS</p>
                <h2 className="section-title">
                  {new Intl.DateTimeFormat("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(parse(selectedDay))}
                </h2>
              </div>
              <button
                className="icon-btn"
                onClick={() => setSelectedDay(null)}
                aria-label="Close habit check-in"
              >
                <X size={18} />
              </button>
            </div>
            <div className="habit-sheet-list">
              {habits.map((habit) => {
                const done = habit.completedDates.includes(selectedDay);
                return (
                  <button
                    key={habit.id}
                    className={done ? "done" : ""}
                    style={
                      { "--habit-color": habit.color } as React.CSSProperties
                    }
                    onClick={() => toggle(habit, selectedDay)}
                  >
                    <span className="habit-sheet-dot">
                      {done && <Check size={15} />}
                    </span>
                    <b>{habit.name}</b>
                    <small>{done ? "Completed" : "Tap to complete"}</small>
                  </button>
                );
              })}
            </div>
            <button
              className="primary habit-sheet-done"
              onClick={() => setSelectedDay(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <form className="panel mt-5 habit-add-panel" onSubmit={add}>
        <h2 className="section-title">Add a habit</h2>
        <div className="habit-add-fields mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1 text-xs font-bold text-[var(--muted)]">
            Habit name
            <input
              id="habit-name-input"
              className="auth-input mt-1"
              value={name}
              maxLength={40}
              placeholder="e.g. Morning walk"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <fieldset className="border-0 p-0">
            <legend className="mb-1 text-xs font-bold text-[var(--muted)]">
              Colour
            </legend>
            <div className="flex flex-wrap gap-2">
              {colors.map((option) => (
                <button
                  type="button"
                  key={option}
                  aria-label={`Choose ${option}`}
                  className={`color-choice ${color === option ? "selected" : ""}`}
                  style={{ backgroundColor: option }}
                  onClick={() => setColor(option)}
                >
                  {color === option && <Check size={14} />}
                </button>
              ))}
            </div>
          </fieldset>
          <button className="primary" disabled={!name.trim()}>
            <Plus size={15} /> Add habit
          </button>
        </div>
      </form>
    </div>
  );
}

function HistoryHub(props: Props) {
  const [section, setSection] = useState<"activities" | "plans">("activities");
  const [period,setPeriod]=useState<"Week"|"Month"|"Year">("Week");
  const formatDuration=(value:number)=>{const minutes=Math.round(value/60),hours=Math.floor(minutes/60),remainder=minutes%60;return hours?`${hours}h ${remainder}m`:`${minutes}m`};
  const today=iso(new Date()),days=period==="Month"?28:365,periodStart=period==="Week"?iso(mondayOf(parse(today))):plusDays(today,1-days),periodEnd=period==="Week"?plusDays(periodStart,6):today;
  const activities=props.store.externalActivities??[],allSessions=props.weeks.flatMap(week=>week.sessions);
  const completedSessions=allSessions.filter(item=>item.completed&&!item.skipped&&item.date>=periodStart&&item.date<=periodEnd);
  const manualRecords=completedSessions.filter(item=>!item.stravaActivityId).map(item=>({date:item.date,distanceKm:item.actualDistanceKm??item.plannedDistanceKm??0,durationSeconds:(item.actualDurationMinutes??item.plannedDurationMinutes??0)*60,type:kind(item.category)}));
  const progressRecords=[...activities.map(item=>({date:item.date,distanceKm:item.distanceKm,durationSeconds:item.durationSeconds,type:item.type==="cycle"?"bike" as const:item.type})),...manualRecords].filter(item=>item.date>=periodStart&&item.date<=periodEnd);
  const seconds=progressRecords.reduce((sum,item)=>sum+item.durationSeconds,0);
  const periodActivities=activities.filter(item=>item.date>=periodStart&&item.date<=periodEnd),elevation=periodActivities.reduce((sum,item)=>sum+(item.elevationGainM??0),0),powerActivities=periodActivities.filter(item=>item.averagePowerWatts!==undefined&&item.durationSeconds>0),powerSeconds=powerActivities.reduce((sum,item)=>sum+item.durationSeconds,0),averagePower=powerSeconds?Math.round(powerActivities.reduce((sum,item)=>sum+item.averagePowerWatts!*item.durationSeconds,0)/powerSeconds):undefined;
  const runDistance=progressRecords.filter(item=>item.type==="run").reduce((sum,item)=>sum+item.distanceKm,0),bikeDistance=progressRecords.filter(item=>item.type==="bike").reduce((sum,item)=>sum+item.distanceKm,0),strengthSeconds=progressRecords.filter(item=>item.type==="strength").reduce((sum,item)=>sum+item.durationSeconds,0);
  const plannedSessions=allSessions.filter(item=>!item.skipped&&item.date>=periodStart&&item.date<=periodEnd),completion=plannedSessions.length?Math.round(completedSessions.length/plannedSessions.length*100):0;
  return (
    <>
      <section className="history-hub-head"><p className="eyebrow">HISTORY</p><h1 className="font-display text-4xl font-bold">Your training</h1><p>Review progress, imported sports or saved weekly plans.</p></section>
      {props.uiNext&&<>
        <div className="ui-next-period-tabs" role="tablist" aria-label="Progress period">
          {(["Week","Month","Year"] as const).map(value=><button key={value} className={period===value?"active":""} aria-selected={period===value} onClick={()=>setPeriod(value)}>{value}</button>)}
        </div>
        <section className="ui-next-progress-overview" aria-label="Training progress summary">
          <div className="ui-next-progress-title">
            <div><small>{period.toUpperCase()} SUMMARY</small><h2>Training overview</h2></div>
            <span>{progressRecords.length} recorded workouts</span>
          </div>
          <div className="ui-next-progress-metrics">
            <article className="run"><span>Running</span><b>{runDistance.toFixed(1)} km</b></article>
            <article className="cycle"><span>Cycling</span><b>{bikeDistance.toFixed(1)} km</b></article>
            <article className="strength"><span>Strength</span><b>{formatDuration(strengthSeconds)}</b></article>
            <article className="time"><span>Training time</span><b>{formatDuration(seconds)}</b></article>
            <article className="completion"><span>Plan completion</span><b>{completion}%</b></article>
          </div>
          {(elevation>0||averagePower!==undefined)&&<div className="ui-next-performance-metrics">
            {elevation>0&&<article><Mountain size={17}/><div><b>{Math.round(elevation).toLocaleString()} m</b><span>Elevation gained</span></div></article>}
            {averagePower!==undefined&&<article><Zap size={17}/><div><b>{averagePower} W</b><span>Time-weighted cycling power</span></div></article>}
          </div>}
          <p className="ui-next-progress-note">Strava and manual workouts; linked sessions count once.</p>
        </section>
      </>}
      <div className="history-section-tabs" role="tablist" aria-label="History section"><button className={section==="activities"?"active":""} onClick={()=>setSection("activities")}>Sports activity</button><button className={section==="plans"?"active":""} onClick={()=>setSection("plans")}>Weekly plans</button></div>
      {section==="activities"?<ActivityTracking store={props.store} setStore={props.setStore} openWeek={props.openWeek} uiNext={props.uiNext} focusActivityId={props.activityFocus} onFocusHandled={props.onActivityFocusHandled}/>:<History weeks={props.weeks} currentWeekId={props.currentWeekId} open={props.openWeek} copy={props.copyWeek}/>}
    </>
  );
}

function History({
  weeks,
  currentWeekId,
  open,
  copy,
}: {
  weeks: TrainingWeek[];
  currentWeekId?: string;
  open: (id: string) => void;
  copy: (week: TrainingWeek) => void;
}) {
  const [month, setMonth] = useState("all"),
    [filter, setFilter] = useState<"all" | "run" | "strength" | "bike">("all"),
    [query, setQuery] = useState(""),
    months = [...new Set(weeks.map((week) => week.startDate.slice(0, 7)))]
      .sort()
      .reverse(),
    matches = (session: Session) =>
      session.category !== "Walk or mobility" &&
      (filter === "all" || kind(session.category) === filter) &&
      (!query.trim() ||
        (session.title + " " + (session.notes ?? ""))
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
    visible = [...weeks]
      .filter(
        (week) =>
          (month === "all" || week.startDate.startsWith(month)) &&
          week.sessions.some(matches),
      )
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    sessions = visible.flatMap((week) => week.sessions.filter(matches)),
    done = sessions.filter((session) => session.completed),
    minutes = done.reduce(
      (sum, session) =>
        sum +
        (session.actualDurationMinutes ?? session.plannedDurationMinutes ?? 0),
      0,
    ),
    runKm = done
      .filter((session) => kind(session.category) === "run")
      .reduce(
        (sum, session) =>
          sum + (session.actualDistanceKm ?? session.plannedDistanceKm ?? 0),
        0,
      ),
    monthLabel =
      month === "all"
        ? "All recorded months"
        : new Intl.DateTimeFormat("en-GB", {
            month: "long",
            year: "numeric",
          }).format(parse(month + "-01"));
  return (
    <>
      <section className="history-head">
        <div>
          <p className="eyebrow">ARCHIVE</p>
          <h2 className="font-display text-3xl font-bold">Weekly plans</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Review progress or reuse a plan from an earlier week.
          </p>
        </div>
        <label>
          Month
          <select
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          >
            <option value="all">All months</option>
            {months.map((value) => (
              <option value={value} key={value}>
                {new Intl.DateTimeFormat("en-GB", {
                  month: "long",
                  year: "numeric",
                }).format(parse(value + "-01"))}
              </option>
            ))}
          </select>
        </label>
      </section>
      <label className="history-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search workouts and notes"
        />
      </label>
      <div className="history-filters">
        {(
          [
            ["all", "All"],
            ["run", "Running"],
            ["strength", "Strength"],
            ["bike", "Cycling"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="history-summary">
        <div>
          <p className="eyebrow">{monthLabel}</p>
          <h2 className="section-title">Summary</h2>
        </div>
        <HistoryStat
          value={`${visible.length}`}
          label={visible.length === 1 ? "Week" : "Weeks"}
        />
        <HistoryStat
          value={`${done.length}/${sessions.length}`}
          label="Completed"
        />
        <HistoryStat value={`${minutes} min`} label="Training" />
        <HistoryStat value={`${runKm.toFixed(1)} km`} label="Running" />
      </section>
      {visible.length ? (
        <div className="history-grid">
          {visible.map((week) => {
            const relevant = week.sessions.filter(matches),
              complete = relevant.filter((session) => session.completed).length,
              pct = relevant.length
                ? Math.round((complete / relevant.length) * 100)
                : 0,
              end = plusDays(week.startDate, 6);
            return (
              <article className="history-card" key={week.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-[var(--muted)]">Week of</p>
                    <h3>
                      {dateFmt.format(parse(week.startDate))} –{" "}
                      {dateFmt.format(parse(end))}
                    </h3>
                  </div>
                  <b>{pct}%</b>
                </div>
                <div className="history-progress">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p>
                  {complete} of {relevant.length}{" "}
                  {filter === "all" ? "workouts" : filter} completed
                </p>
                <div className="history-actions">
                  <button className="secondary" onClick={() => open(week.id)}>
                    Open week
                  </button>
                  {week.id !== currentWeekId && (
                    <button className="secondary" onClick={() => copy(week)}>
                      <Copy size={14} /> Copy to current
                    </button>
                  )}{" "}
                  {week.id === currentWeekId && <span>Current week</span>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state panel mt-5">
          <span>
            <Search size={20} />
          </span>
          <div>
            <b>No weekly plans found</b>
            <p>
              {month !== "all" || filter !== "all" || query.trim()
                ? "Clear the current search and filters to see all recorded weeks."
                : "Complete or plan a week and it will appear here."}
            </p>
          </div>
          {month !== "all" || filter !== "all" || query.trim() ? (
            <button
              className="secondary"
              onClick={() => {
                setMonth("all");
                setFilter("all");
                setQuery("");
              }}
            >
              Clear filters
            </button>
          ) : (
            currentWeekId && (
              <button className="secondary" onClick={() => open(currentWeekId)}>
                Open current week
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}
function HistoryStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
function SettingsView({
  store,
  user,
  syncMessage,
  status,
  setTheme,
  restore,
  restoreWeek,
  uploadDevice,
  downloadCloud,
  clear,
  uiNext = false,
}: {
  store: PlannerStore;
  user: User | null;
  syncMessage: string;
  status: React.ReactNode;
  setTheme: (theme: AppTheme) => void;
  restore: (s: PlannerStore) => Promise<void>;
  restoreWeek: (week: TrainingWeek) => Promise<void>;
  uploadDevice: () => Promise<void>;
  downloadCloud: () => Promise<void>;
  clear: () => void;
  uiNext?: boolean;
}) {
  const [message, setMessage] = useState(""),
    health = inspectPlannerStore(store),
    issueCount =
      health.duplicateWeeks +
      health.duplicateSessionIds +
      health.duplicateStravaLinks +
      health.outOfRangeSessions +
      (health.activeWeekValid ? 0 : 1),
    activeWeek = store.weeks.find((week) => week.id === store.active),
    latestActivity = [...(store.externalActivities ?? [])].sort((a, b) =>
      b.date.localeCompare(a.date),
    )[0];
  const backup = () => {
    const payload = {
      ...store,
      exportedAt: new Date().toISOString(),
      formatVersion: 1,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stride-backup-${iso(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded.");
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (raw?.format === "stride-week-recovery" && raw?.week) {
        const week = raw.week as TrainingWeek;
        if (
          typeof week.id !== "string" ||
          typeof week.startDate !== "string" ||
          !Array.isArray(week.sessions) ||
          week.sessions.some(
            (session) =>
              !session ||
              typeof session.id !== "string" ||
              typeof session.date !== "string",
          )
        )
          throw new Error("The recovery file contains an invalid week.");
        await restoreWeek(week);
        setMessage(
          user
            ? "Recovered week restored and uploaded to Firestore."
            : "Recovered week restored on this device.",
        );
        return;
      }
      const value = validateBackup(raw);
      await restore(value);
      setMessage(
        user
          ? "Backup restored and uploaded to Firestore."
          : "Backup restored on this device.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not restore this backup.",
      );
    }
  };
  return (
    <>
      <p className="eyebrow">PREFERENCES</p>
      <h1 className="font-display text-4xl font-bold">Settings</h1>
      {uiNext && <nav className="ui-next-more-index" aria-label="More sections"><a href="#more-account">Account</a><a href="#more-appearance">Appearance</a><a href="#more-device">Device</a><a href="#more-data">Data &amp; sync</a></nav>}
      <div className="settings-status">{status}</div>
      <section
        className={`data-health ${issueCount ? "attention" : "healthy"}`}
      >
        <div>
          <p className="eyebrow">DATA HEALTH</p>
          <b>
            {issueCount
              ? `${issueCount} issue${issueCount === 1 ? "" : "s"} detected`
              : "Planner data is healthy"}
          </b>
        </div>
        <dl>
          <div>
            <dt>Active week</dt>
            <dd>
              {activeWeek
                ? `${dateFmt.format(parse(activeWeek.startDate))} – ${dateFmt.format(parse(plusDays(activeWeek.startDate, 6)))}`
                : "Not set"}
            </dd>
          </div>
          <div>
            <dt>Duplicate weeks</dt>
            <dd>{health.duplicateWeeks}</dd>
          </div>
          <div>
            <dt>Duplicate Strava links</dt>
            <dd>{health.duplicateStravaLinks}</dd>
          </div>
          <div>
            <dt>Latest Strava activity</dt>
            <dd>
              {latestActivity
                ? `${latestActivity.date} · ${latestActivity.title}`
                : "None loaded"}
            </dd>
          </div>
        </dl>
        <small>
          Integrity repairs run automatically when data is loaded, restored,
          merged or reconciled.
        </small>
      </section>
      <div className="panel settings-panel mt-7 max-w-2xl">
        <div className="settings-group-heading" id="more-account">
          <span>Account</span>
          <small>Sign-in and cloud status</small>
        </div>
        <AuthPanel user={user} syncMessage={syncMessage} />
        <div className="settings-group-heading" id="more-appearance">
          <span>Appearance</span>
          <small>How Stride looks on this device</small>
        </div>
        <div className="settings-row theme-setting">
          <div>
            <b>Colour theme</b>
            <p className="text-sm text-[var(--muted)]">
              Choose the colour scheme used across every screen.
            </p>
          </div>
          <div
            className="theme-options"
            role="radiogroup"
            aria-label="App colour scheme"
          >
            {(
              [
                ["light", "Light", "Clean neutral"],
                ["dark", "Dark", "Low-light"],
                ["leaf", "Hidden Leaf", "Shinobi inspired"],
              ] as const
            ).map(([value, label, detail]) => (
              <button
                key={value}
                role="radio"
                aria-checked={
                  (store.theme ?? (store.dark ? "dark" : "light")) === value
                }
                className={
                  (store.theme ?? (store.dark ? "dark" : "light")) === value
                    ? "selected"
                    : ""
                }
                onClick={() => setTheme(value)}
              >
                <span className={`theme-swatch ${value}`}>
                  {value === "leaf" ? (
                    <img
                      src="/icons/hidden_leaf.svg"
                      alt=""
                      aria-hidden="true"
                    />
                  ) : value === "dark" ? (
                    <Moon size={15} />
                  ) : (
                    <Sun size={15} />
                  )}
                </span>
                <span>
                  <b>{label}</b>
                  <small>{detail}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="settings-group-heading" id="more-device">
          <span>Device</span>
          <small>Installation and phone access</small>
        </div>
        <div className="settings-row">
          <div>
            <b>Install on your phone</b>
            <p className="text-sm text-[var(--muted)]">
              Open the browser menu and choose “Add to Home Screen” or “Install
              app”.
            </p>
          </div>
          <Smartphone size={22} className="text-lime-500" />
        </div>
        <div className="settings-group-heading" id="more-data">
          <span>Backup &amp; sync</span>
          <small>Move or recover your planner safely</small>
        </div>
        <div className="settings-row">
          <div>
            <b>Backup and restore</b>
            <p className="text-sm text-[var(--muted)]">
              Download a copy before changing phones or clearing browser data.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button className="secondary" onClick={backup}>
              <Download size={15} /> Export
            </button>
            <label className="secondary cursor-pointer">
              <Upload size={15} /> Import
              <input
                className="hidden"
                type="file"
                accept="application/json,.json"
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                onChange={(e) => importBackup(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <b>Fix sync between devices</b>
            <p className="text-sm text-[var(--muted)]">
              Choose which copy is correct. These actions replace data instead
              of merging it.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              className="secondary"
              disabled={!user}
              onClick={async () => {
                if (
                  !confirm(
                    "Replace the cloud copy with everything currently shown on this device?",
                  )
                )
                  return;
                try {
                  await uploadDevice();
                  setMessage(
                    "This device is now the authoritative cloud copy.",
                  );
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Cloud upload failed.",
                  );
                }
              }}
            >
              <Upload size={15} /> Use this device
            </button>
            <button
              className="secondary"
              disabled={!user}
              onClick={async () => {
                if (
                  !confirm(
                    "Discard this browser's local planner and replace it with the cloud copy?",
                  )
                )
                  return;
                try {
                  await downloadCloud();
                  setMessage(
                    "This browser now exactly matches the cloud copy.",
                  );
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Cloud download failed.",
                  );
                }
              }}
            >
              <Download size={15} /> Use cloud copy
            </button>
          </div>
        </div>
        <div className="settings-danger-zone">
          <div className="settings-group-heading">
            <span>Data management</span>
            <small>Permanent and destructive actions</small>
          </div>
          <b>Planner data</b>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Saved offline in this browser and synchronized to Firestore when
            signed in.
          </p>
          <button className="danger" onClick={clear}>
            Clear all data
          </button>
        </div>
        {message && (
          <p className="mt-4 rounded-lg bg-[var(--soft)] p-3 text-sm">
            {message}
          </p>
        )}
      </div>
    </>
  );
}

function AuthPanel({
  user,
  syncMessage,
}: {
  user: User | null;
  syncMessage: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (mode: "login" | "register") => {
    setBusy(true);
    setMessage("");
    try {
      await (mode === "login"
        ? logIn(email, password)
        : register(email, password));
      setPassword("");
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "Could not connect to Firebase.";
      setMessage(
        text
          .replace("Firebase: ", "")
          .replace(/\s*(auth\/[^)]+)\.?/, "")
          .trim(),
      );
    } finally {
      setBusy(false);
    }
  };
  if (user)
    return (
      <div className="settings-row pt-0">
        <div>
          <div className="flex items-center gap-2">
            <Cloud size={18} className="text-lime-500" />
            <b>Cloud sync enabled</b>
          </div>
          <p className="text-sm text-[var(--muted)]">
            {user.email} · {syncMessage}
          </p>
        </div>
        <button className="secondary" onClick={() => logOut()}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
    );
  return (
    <div className="border-b border-[var(--line)] pb-5">
      <div className="mb-3 flex items-center gap-2">
        <CloudOff size={18} className="text-[var(--muted)]" />
        <div>
          <b>Sync between devices</b>
          <p className="text-sm text-[var(--muted)]">
            Sign into the same account on your PC and phone.
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          className="auth-input"
          type="email"
          autoComplete="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="auth-input"
          type="password"
          minLength={6}
          autoComplete="current-password"
          placeholder="Password (6+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          disabled={busy || !email || password.length < 6}
          className="primary disabled:opacity-50"
          onClick={() => submit("login")}
        >
          Sign in
        </button>
        <button
          disabled={busy || !email || password.length < 6}
          className="secondary disabled:opacity-50"
          onClick={() => submit("register")}
        >
          Create account
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-red-500">{message}</p>}
    </div>
  );
}
