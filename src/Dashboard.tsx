import { useState, type CSSProperties } from "react";
import {
  Activity,
  Bike,
  CalendarDays,
  Check,
  ChevronRight,
  CircleGauge,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Link2,
  Sparkles,
  X,
  Target,
} from "lucide-react";
import { iso, kind } from "./data";
import type { PlannerStore } from "./storage";
import type { Session, TrainingWeek } from "./types";

type Props = {
  store: PlannerStore;
  openPlanner: () => void;
  openSettings: () => void;
  openHabits: () => void;
  openCoach: (focus: "recovery" | "review") => void;
  openWorkout: (activityId: string) => void;
  toggleWorkout: (weekId: string, sessionId: string) => void;
  uiNext?: boolean;
};
type Sport = "run" | "bike" | "strength";

const parse = (value: string) => new Date(value + "T12:00:00");
const plusDays = (value: string, days: number) => {
  const date = parse(value);
  date.setDate(date.getDate() + days);
  return iso(date);
};
const weekStart = (date = new Date()) => {
  const copy = new Date(date),
    day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return iso(copy);
};
const km = (session: Session) =>
  session.actualDistanceKm ?? session.plannedDistanceKm ?? 0;
const minutes = (session: Session) =>
  session.actualDurationMinutes ?? session.plannedDurationMinutes ?? 0;
const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);
const percent = (value: number, target?: number) =>
  target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
const shortDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function Ring({ value, color }: { value: number; color: string }) {
  return (
    <span
      className="dashboard-ring"
      style={
        {
          "--ring-value": `${Math.min(100, Math.max(0, value)) * 3.6}deg`,
          "--ring-color": color,
        } as CSSProperties
      }
    >
      <b>{value}%</b>
    </span>
  );
}

export default function Dashboard({ store, openPlanner, openSettings, openHabits, openCoach, openWorkout, toggleWorkout, uiNext = false }: Props) {
  const [breakdownOpen,setBreakdownOpen]=useState(false),[goalOpen,setGoalOpen]=useState(false);
  const today = iso(new Date()),
    start = weekStart(),
    end = plusDays(start, 6),
    week =
      store.weeks.find((item) => item.startDate === start) ??
      store.weeks.find((item) => item.id === store.active) ??
      store.weeks[0];
  const sessions =
      week?.sessions.filter((item) => item.category !== "Walk or mobility") ??
      [],
    completed = sessions.filter((item) => item.completed && !item.skipped),
    goals = week?.targets ?? store.goals ?? {};
  const completedBy = (sport: Sport) =>
      completed.filter((item) => kind(item.category) === sport),
    runKm = sum(completedBy("run").map(km)),
    bikeKm = sum(completedBy("bike").map(km)),
    strengthDone = completedBy("strength").length,
    plannedStrength = sessions.filter(
      (item) => kind(item.category) === "strength" && !item.skipped,
    ).length;
  const plannedRun = sum(
      sessions
        .filter((item) => kind(item.category) === "run" && !item.skipped)
        .map((item) => item.plannedDistanceKm ?? 0),
    ),
    plannedBike = sum(
      sessions
        .filter((item) => kind(item.category) === "bike" && !item.skipped)
        .map((item) => item.plannedDistanceKm ?? 0),
    );
  const weekDays = Array.from({ length: 7 }, (_, index) =>
      plusDays(start, index),
    ),
    elapsed = weekDays.filter((day) => day <= today),
    habitChecks = store.habits.length * elapsed.length,
    habitDone = store.habits.reduce(
      (total, habit) =>
        total +
        elapsed.filter((day) => habit.completedDates.includes(day)).length,
      0,
    ),
    habitPct = habitChecks ? Math.round((habitDone / habitChecks) * 100) : 0;
  const daySportMinutes = weekDays.map((day) => ({
      run: sum(
        completed
          .filter((item) => item.date === day && kind(item.category) === "run")
          .map(minutes),
      ),
      bike: sum(
        completed
          .filter((item) => item.date === day && kind(item.category) === "bike")
          .map(minutes),
      ),
      strength: sum(
        completed
          .filter(
            (item) => item.date === day && kind(item.category) === "strength",
          )
          .map(minutes),
      ),
    })),
    dayMinutes = daySportMinutes.map(
      (value) => value.run + value.bike + value.strength,
    ),
    maxMinutes = Math.max(1, ...dayMinutes);
  const sportMinutes = {
      run: sum(completedBy("run").map(minutes)),
      bike: sum(completedBy("bike").map(minutes)),
      strength: sum(completedBy("strength").map(minutes)),
    },
    trainingMinutes =
      sportMinutes.run + sportMinutes.bike + sportMinutes.strength;
  const mixRun = trainingMinutes
      ? (sportMinutes.run / trainingMinutes) * 100
      : 0,
    mixBike = trainingMinutes ? (sportMinutes.bike / trainingMinutes) * 100 : 0;
  const latestRecovery = [...(store.recovery ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0];
  const upcoming = store.weeks
    .flatMap((item) => item.sessions)
    .filter(
      (item) =>
        item.date >= today &&
        !item.completed &&
        !item.skipped &&
        item.category !== "Walk or mobility",
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const recent = [...(store.externalActivities ?? [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4),
    allDates = new Set<string>([
      ...store.weeks
        .flatMap((item) => item.sessions)
        .filter((item) => item.completed)
        .map((item) => item.date),
      ...(store.externalActivities ?? []).map((item) => item.date),
    ]);
  let streak = 0,
    cursor = allDates.has(today) ? today : plusDays(today, -1);
  while (allDates.has(cursor)) {
    streak++;
    cursor = plusDays(cursor, -1);
  }
  const longestRun = Math.max(
      0,
      ...(store.externalActivities ?? [])
        .filter((item) => item.type === "run")
        .map((item) => item.distanceKm),
    ),
    longestRide = Math.max(
      0,
      ...(store.externalActivities ?? [])
        .filter((item) => item.type === "cycle")
        .map((item) => item.distanceKm),
    );
  const completionPct = sessions.length
      ? Math.round((completed.length / sessions.length) * 100)
      : 0,
    dateLabel = week
      ? `${shortDate.format(parse(week.startDate))} – ${shortDate.format(parse(plusDays(week.startDate, 6)))}`
      : dateLabelFallback(start, end);
  const goalsView = [
    {
      label: "Running",
      value: runKm,
      target: goals.weeklyRunKm ?? plannedRun,
      unit: "km",
      color: "var(--sport-run)",
      icon: Footprints,
    },
    {
      label: "Cycling",
      value: bikeKm,
      target: goals.weeklyCycleKm ?? plannedBike,
      unit: "km",
      color: "var(--sport-cycle)",
      icon: Bike,
    },
    {
      label: "Workouts",
      value: strengthDone,
      target: plannedStrength,
      unit: "sessions",
      color: "var(--sport-strength)",
      icon: Dumbbell,
    },
  ];
  const trainingTimeLabel = trainingMinutes >= 60
    ? Math.floor(trainingMinutes / 60) + "h " + (trainingMinutes % 60) + "m"
    : trainingMinutes + " min";
  const goalWeeks = goals.goalDate
    ? Math.max(0, Math.ceil((parse(goals.goalDate).getTime() - Date.now()) / 604800000))
    : undefined;
  const todaySessions = sessions.filter((item) => item.date === today && !item.skipped);
  const latestWorkout = recent[0];
  const nextUp=store.weeks.flatMap(item=>item.sessions).filter(item=>item.date>today&&!item.completed&&!item.skipped&&item.category!=="Walk or mobility").sort((a,b)=>a.date.localeCompare(b.date))[0];
  const goalPhase=goalWeeks===undefined?"Build":goalWeeks<=2?"Taper":goalWeeks<=8?"Build":goalWeeks<=16?"Base":"Foundation";
  const previousWeek=store.weeks.find((item)=>item.startDate===plusDays(start,-7)),previousCompleted=previousWeek?.sessions.filter(item=>item.completed&&!item.skipped&&item.category!=="Walk or mobility")??[],previousMinutes=sum(previousCompleted.map(minutes)),previousDistance=sum(previousCompleted.map(km));
  return (
    <div className="fitness-dashboard">
      <header className="dashboard-welcome">
        <div>
          <p className="eyebrow">FITNESS OVERVIEW</p>
          <h1>Welcome back</h1>
          <p>{dateLabel} · updated from your planner and Strava</p>
        </div>
        <button className="primary" onClick={openPlanner}>
          <CalendarDays size={16} /> Open weekly planner
        </button>
      </header>
      {uiNext && (
        <section className="ui-next-weekly" aria-label="This week">
          <div className="ui-next-summary-head">
            <span>THIS WEEK</span>
            <button onClick={()=>setBreakdownOpen(true)}>View breakdown <ChevronRight size={14} /></button>
          </div>
          <div className="ui-next-summary-grid">
            <article><span><Check size={18} /></span><small>WORKOUTS</small><strong>{completed.length} of {sessions.length}</strong></article>
            <article><span><Footprints size={18} /></span><small>DISTANCE</small><strong>{(runKm + bikeKm).toFixed(1)} km</strong></article>
            <article><span><CircleGauge size={18} /></span><small>TIME</small><strong>{trainingTimeLabel}</strong></article>
          </div>
        </section>
      )}
      {uiNext && goals.goalName && (
        <button className="ui-next-goal" onClick={()=>setGoalOpen(true)}>
          <span><Target size={18} /></span>
          <div><small>GOAL FOCUS</small><b>{goals.goalName}</b><p>{goalWeeks !== undefined ? goalWeeks + " weeks to go · " : ""}{goals.goalDistanceKm ? goals.goalDistanceKm + " km · " : ""}Plan on track</p></div>
          <ChevronRight size={18} />
        </button>
      )}
      {uiNext&&breakdownOpen&&<div className="modal-bg" onMouseDown={event=>event.target===event.currentTarget&&setBreakdownOpen(false)}><section className="modal ui-next-breakdown" role="dialog" aria-modal="true" aria-labelledby="week-breakdown-title"><header><div><small>THIS WEEK</small><h2 id="week-breakdown-title">Training breakdown</h2></div><button className="icon-btn" onClick={()=>setBreakdownOpen(false)} aria-label="Close weekly breakdown"><X size={18}/></button></header><div className="ui-next-breakdown-total"><b>{completed.length} of {sessions.length}</b><span>workouts complete · {completionPct}%</span></div><div className="ui-next-breakdown-list">{goalsView.map(item=><article key={item.label}><item.icon size={18}/><div><b>{item.label}</b><span>{item.value.toFixed(item.unit==="km"?1:0)} of {item.target?.toFixed(item.unit==="km"?1:0)??"—"} {item.unit}</span></div><strong>{percent(item.value,item.target)}%</strong></article>)}</div><div className="ui-next-week-compare"><span>Compared with last week</span><b>{trainingMinutes-previousMinutes>=0?"+":""}{trainingMinutes-previousMinutes} min · {runKm+bikeKm-previousDistance>=0?"+":""}{(runKm+bikeKm-previousDistance).toFixed(1)} km</b></div></section></div>}
      {uiNext&&goalOpen&&<div className="modal-bg" onMouseDown={event=>event.target===event.currentTarget&&setGoalOpen(false)}><section className="modal ui-next-goal-detail" role="dialog" aria-modal="true" aria-labelledby="goal-detail-title"><header><div><small>GOAL FOCUS</small><h2 id="goal-detail-title">{goals.goalName}</h2></div><button className="icon-btn" onClick={()=>setGoalOpen(false)} aria-label="Close goal focus"><X size={18}/></button></header><div className="ui-next-goal-hero"><Target size={24}/><small>{goalWeeks!==undefined?goalWeeks+" WEEKS TO GO":"ONGOING GOAL"}</small><b>{goalPhase} phase</b><p>{goals.goalDistanceKm?goals.goalDistanceKm+" km target":goals.goalType==="race"?"Race preparation":"Consistent training"}</p></div><div className="ui-next-phase-track">{["Foundation","Base","Build","Taper"].map(value=><span className={value===goalPhase?"active":""} key={value}><i/>{value}</span>)}</div><section className="ui-next-goal-support"><b>This week supports the goal</b><p>{plannedRun>0?"Your planned running builds the consistency and endurance needed for this target. ":""}{plannedBike>0?"Cycling adds aerobic work with lower impact. ":""}Strength sessions support resilience around the key endurance work.</p></section><div className="ui-next-goal-metrics"><div><span>Run target</span><b>{goals.weeklyRunKm??plannedRun} km</b></div><div><span>Cycle target</span><b>{goals.weeklyCycleKm??plannedBike} km</b></div><div><span>Workouts</span><b>{goals.workoutSessions??sessions.filter(item=>!item.skipped).length}</b></div></div><button className="secondary ui-next-goal-edit" onClick={()=>{setGoalOpen(false);openSettings()}}>Edit goal settings</button></section></div>}
      {uiNext && !goals.goalName && <button className="ui-next-goal ui-next-goal-empty" onClick={openSettings}><span><Target size={18}/></span><div><small>TRAINING GOAL</small><b>Set a goal focus</b><p>Add a target event or distance to make coaching more relevant.</p></div><ChevronRight size={18}/></button>}
      {uiNext && <section className="ui-next-today-card"><div className="ui-next-card-head"><div><small>TODAY'S TRAINING</small><h2>{todaySessions.length ? todaySessions.length+" workout"+(todaySessions.length === 1 ? "" : "s")+" planned" : "No workout planned"}</h2></div><button onClick={openPlanner}>Open plan <ChevronRight size={14}/></button></div>{todaySessions.length > 0 && <div className="ui-next-today-sessions">{todaySessions.map((session)=><article key={session.id}><button className="ui-next-session-copy" onClick={openPlanner}><span><b>{session.title}</b><small>{session.category}{minutes(session) ? " / "+minutes(session)+" min" : ""}</small></span><ChevronRight size={15}/></button><button className={session.completed?"ui-next-session-done completed":"ui-next-session-done"} onClick={()=>toggleWorkout(week.id,session.id)}><Check size={14}/>{session.completed?"Completed":"Mark done"}</button></article>)}</div>}</section>}
      {uiNext && <div className="ui-next-coach-shortcuts"><button onClick={()=>openCoach("recovery")}><span><HeartPulse size={18}/></span><div><small>RECOVERY</small><b>{latestRecovery ? `Energy ${latestRecovery.energy}/5 / Soreness ${latestRecovery.soreness}/5` : "How are you feeling?"}</b><p>{latestRecovery ? `Last check-in ${shortDate.format(parse(latestRecovery.date))}` : "Add a quick check-in to improve your advice."}</p></div><ChevronRight size={17}/></button><button onClick={()=>latestWorkout ? openWorkout(latestWorkout.id) : openCoach("review")}><span><Sparkles size={18}/></span><div><small>LATEST WORKOUT</small><b>{latestWorkout?.title ?? "No activity to review yet"}</b><p>{latestWorkout ? `${latestWorkout.distanceKm.toFixed(1)} km / Review what it means for your plan` : "Complete or import a workout to unlock feedback."}</p></div><ChevronRight size={17}/></button></div>}
      {uiNext && <section className="ui-next-habits-card"><div className="ui-next-card-head"><div><small>HABITS · THIS WEEK</small><h2>Small actions, repeated</h2></div><button onClick={openHabits}>Manage <ChevronRight size={15}/></button></div><div className="ui-next-habit-week"><div className="ui-next-habit-days"><span/>{weekDays.map(day=><small key={day}>{new Intl.DateTimeFormat("en-GB",{weekday:"narrow"}).format(parse(day))}</small>)}</div>{store.habits.slice(0,4).map(habit=><div className="ui-next-habit-row" key={habit.id}><b>{habit.name}</b>{weekDays.map(day=><i key={day} style={{background:habit.completedDates.includes(day)?habit.color:"transparent"}}/>)}</div>)}</div></section>}
      {uiNext&&nextUp&&<button className="ui-next-next-up" onClick={openPlanner}><span><CalendarDays size={17}/></span><div><small>NEXT UP · {shortDate.format(parse(nextUp.date))}</small><b>{nextUp.title}</b><p>{nextUp.category}{minutes(nextUp)?" · "+minutes(nextUp)+" min":""}</p></div><ChevronRight size={17}/></button>}
      <section className="dashboard-kpis" aria-label="Weekly fitness summary">
        <article className="dashboard-kpi teal">
          <span>
            <Check size={19} />
          </span>
          <small>WEEKLY COMPLETION</small>
          <strong>{completionPct}%</strong>
          <p>
            {completed.length} of {sessions.length} workouts completed
          </p>
          <div className="kpi-progress">
            <i style={{ width: `${completionPct}%` }} />
          </div>
        </article>
        <article className="dashboard-kpi orange">
          <span>
            <Footprints size={19} />
          </span>
          <small>RUNNING</small>
          <strong>{runKm.toFixed(1)} km</strong>
          <p>{plannedRun.toFixed(1)} km planned this week</p>
          <div className="kpi-progress">
            <i
              style={{
                width: `${percent(runKm, goals.weeklyRunKm ?? plannedRun)}%`,
              }}
            />
          </div>
        </article>
        <article className="dashboard-kpi blue">
          <span>
            <Bike size={19} />
          </span>
          <small>CYCLING</small>
          <strong>{bikeKm.toFixed(1)} km</strong>
          <p>{plannedBike.toFixed(1)} km planned this week</p>
          <div className="kpi-progress">
            <i
              style={{
                width: `${percent(bikeKm, goals.weeklyCycleKm ?? plannedBike)}%`,
              }}
            />
          </div>
        </article>
        <article className="dashboard-kpi violet">
          <span>
            <Flame size={19} />
          </span>
          <small>TRAINING STREAK</small>
          <strong>
            {streak} day{streak === 1 ? "" : "s"}
          </strong>
          <p>
            {strengthDone} strength session{strengthDone === 1 ? "" : "s"}{" "}
            completed
          </p>
        </article>
      </section>
      <div className="dashboard-main-grid">
        <section className="dashboard-card activity-chart">
          <div className="dashboard-card-head">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Training this week</h2>
            </div>
            <span>{trainingMinutes} min completed</span>
          </div>
          <div className="activity-chart-legend" aria-label="Sport colours">
            <span>
              <i className="run" />
              Running
            </span>
            <span>
              <i className="bike" />
              Cycling
            </span>
            <span>
              <i className="strength" />
              Strength
            </span>
          </div>
          <div className="dashboard-bars">
            {weekDays.map((day, index) => {
              const values = daySportMinutes[index],
                total = dayMinutes[index];
              return (
                <div
                  key={day}
                  className={day === today ? "is-current-day" : undefined}
                  aria-label={`${shortDate.format(parse(day))}: ${total} training minutes`}
                >
                  <span className="dashboard-bar-track">
                    <span
                      className="dashboard-bar-fill"
                      style={{
                        height: `${total ? Math.max(12, (total / maxMinutes) * 100) : 0}%`,
                      }}
                    >
                      {(["run", "bike", "strength"] as const).map(
                        (sport) =>
                          values[sport] > 0 && (
                            <i
                              key={sport}
                              className={sport}
                              style={{
                                height: `${(values[sport] / total) * 100}%`,
                              }}
                            />
                          ),
                      )}
                    </span>
                  </span>
                  <small>{shortDate.format(parse(day)).split(" ")[0]}</small>
                  <b>{total ? `${total}m` : ""}</b>
                </div>
              );
            })}
          </div>
        </section>
        <section className="dashboard-card sport-balance">
          <div className="dashboard-card-head">
            <div>
              <p className="eyebrow">BALANCE</p>
              <h2>Training mix</h2>
            </div>
          </div>
          <div className="sport-balance-body">
            <div
              className="dashboard-donut"
              style={{
                background: `conic-gradient(var(--sport-run) 0 ${mixRun}%,var(--sport-cycle) ${mixRun}% ${mixRun + mixBike}%,var(--sport-strength) ${mixRun + mixBike}% 100%)`,
              }}
            >
              <span>
                <b>{trainingMinutes}</b>
                <small>minutes</small>
              </span>
            </div>
            <div className="sport-legend">
              <span>
                <i className="run" />
                <b>Running</b>
                <small>{sportMinutes.run} min</small>
              </span>
              <span>
                <i className="bike" />
                <b>Cycling</b>
                <small>{sportMinutes.bike} min</small>
              </span>
              <span>
                <i className="strength" />
                <b>Strength</b>
                <small>{sportMinutes.strength} min</small>
              </span>
            </div>
          </div>
        </section>
        <section className="dashboard-card goals-card">
          <div className="dashboard-card-head">
            <div>
              <p className="eyebrow">YOUR GOALS</p>
              <h2>Weekly targets</h2>
            </div>
            <Target size={18} />
          </div>
          <div className="dashboard-goals">
            {goalsView.map(
              ({ label, value, target, unit, color, icon: Icon }) => (
                <div key={label}>
                  <span className="goal-icon" style={{ color }}>
                    <Icon size={18} />
                  </span>
                  <span>
                    <b>{label}</b>
                    <small>
                      {value.toFixed(unit === "sessions" ? 0 : 1)} / {target}{" "}
                      {unit}
                    </small>
                  </span>
                  <Ring value={percent(value, target)} color={color} />
                </div>
              ),
            )}
          </div>
        </section>
        <section className="dashboard-card wellbeing-card">
          <div className="dashboard-card-head">
            <div>
              <p className="eyebrow">CONSISTENCY</p>
              <h2>Habits and recovery</h2>
            </div>
            <CircleGauge size={18} />
          </div>
          <div className="wellbeing-score">
            <Ring value={habitPct} color="var(--state-complete)" />
            <div>
              <b>{habitPct}% habit consistency</b>
              <p>
                {habitDone} of {habitChecks} available check-ins this week
              </p>
            </div>
          </div>
          <div className="recovery-stats">
            <span>
              <small>ENERGY</small>
              <b>{latestRecovery ? `${latestRecovery.energy}/5` : "—"}</b>
            </span>
            <span>
              <small>SORENESS</small>
              <b>{latestRecovery ? `${latestRecovery.soreness}/5` : "—"}</b>
            </span>
            <span>
              <small>LAST CHECK-IN</small>
              <b>
                {latestRecovery
                  ? shortDate.format(parse(latestRecovery.date))
                  : "None"}
              </b>
            </span>
          </div>
        </section>
        <section className="dashboard-card upcoming-card">
          <div className="dashboard-card-head">
            <div>
              <p className="eyebrow">SCHEDULED</p>
              <h2>Coming up</h2>
            </div>
            <button onClick={openPlanner}>
              View planner <ChevronRight size={14} />
            </button>
          </div>
          <div className="dashboard-list">
            {upcoming.length ? (
              upcoming.map((item) => (
                <div key={item.id}>
                  <span
                    className={`dashboard-sport-icon ${kind(item.category)}`}
                  >
                    {kind(item.category) === "run" ? (
                      <Activity size={17} />
                    ) : kind(item.category) === "bike" ? (
                      <Bike size={17} />
                    ) : (
                      <Dumbbell size={17} />
                    )}
                  </span>
                  <span>
                    <b>{item.title}</b>
                    <small>
                      {shortDate.format(parse(item.date))} ·{" "}
                      {item.plannedDistanceKm
                        ? `${item.plannedDistanceKm} km`
                        : item.plannedDurationMinutes
                          ? `${item.plannedDurationMinutes} min`
                          : item.category}
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <div className="dashboard-empty-action">
                <span>
                  <CalendarDays size={18} />
                </span>
                <div>
                  <b>No upcoming workouts</b>
                  <p>Add sessions manually or generate your next week.</p>
                </div>
                <button className="secondary" onClick={openPlanner}>
                  Open planner
                </button>
              </div>
            )}
          </div>
        </section>
        <section className="dashboard-card recent-card">
          <div className="dashboard-card-head">
            <div>
              <p className="eyebrow">STRAVA</p>
              <h2>Recent activity</h2>
            </div>
            <span>
              {store.activitiesSyncedAt ? "Synced" : "Waiting for sync"}
            </span>
          </div>
          <div className="dashboard-list">
            {recent.length ? (
              recent.map((item) => (
                <a
                  key={item.id}
                  href={item.stravaUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span
                    className={`dashboard-sport-icon ${item.type === "cycle" ? "bike" : "run"}`}
                  >
                    {item.type === "cycle" ? (
                      <Bike size={17} />
                    ) : (
                      <Activity size={17} />
                    )}
                  </span>
                  <span>
                    <b>{item.title}</b>
                    <small>
                      {shortDate.format(parse(item.date))} ·{" "}
                      {item.distanceKm.toFixed(1)} km
                    </small>
                  </span>
                  <Link2 size={14} />
                </a>
              ))
            ) : (
              <div className="dashboard-empty-action">
                <span>
                  <Link2 size={18} />
                </span>
                <div>
                  <b>No Strava activity yet</b>
                  <p>Connect or refresh Strava from Settings.</p>
                </div>
                <button className="secondary" onClick={openSettings}>
                  Open Settings
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
      <section className="dashboard-records">
        <article>
          <small>LONGEST RUN</small>
          <b>{longestRun.toFixed(1)} km</b>
        </article>
        <article>
          <small>LONGEST RIDE</small>
          <b>{longestRide.toFixed(1)} km</b>
        </article>
        <article>
          <small>HABITS THIS WEEK</small>
          <b>{habitDone}</b>
        </article>
        <article>
          <small>ACTIVE DAYS</small>
          <b>{new Set(completed.map((item) => item.date)).size}</b>
        </article>
      </section>
    </div>
  );
}

const dateLabelFallback = (start: string, end: string) =>
  `${shortDate.format(parse(start))} – ${shortDate.format(parse(end))}`;
