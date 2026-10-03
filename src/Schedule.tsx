import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Activity,
  Bike,
  Check,
  CircleSlash2,
  Copy,
  Dumbbell,
  GripVertical,
  EllipsisVertical,
  Link2,
  Lock,
  Moon,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
  X,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { iso, kind, sessionTarget } from "./data";
import type { Category, Session, TrainingWeek } from "./types";

const parse = (value: string) => new Date(`${value}T12:00:00`);
const plusDays = (value: string, days: number) => {
  const date = parse(value);
  date.setDate(date.getDate() + days);
  return iso(date);
};
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long" }),
  dateFmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  });
const sessionIcon = (category: Category) =>
  kind(category) === "run"
    ? Activity
    : kind(category) === "bike"
      ? Bike
      : kind(category) === "strength"
        ? Dumbbell
        : Moon;

interface ScheduleProps {
  week: TrainingWeek;
  edit: (session: Session) => void;
  update: (session: Session) => void;
  complete: (id: string) => void;
  add: (date: string) => void;
  setRestDay: (date: string, rest: boolean) => void;
  move: (id: string, date: string) => void;
  duplicate: (session: Session) => void;
  repeat: (session: Session) => void;
  remove: (session: Session) => void;
}

export default function Schedule({
  week,
  edit,
  update,
  complete,
  add,
  setRestDay,
  move,
  duplicate,
  repeat,
  remove,
}: ScheduleProps) {
  const [menuSession, setMenuSession] = useState<Session | null>(null);
  const dropped = (event: DragEndEvent) => {
    const translated = event.active.rect.current.translated;
    let targetDate = event.over ? String(event.over.id) : "";
    if (translated) {
      const x = translated.left + translated.width / 2,
        y = translated.top + translated.height / 2,
        days = [...document.querySelectorAll<HTMLElement>("[data-drop-date]")],
        containing = days.find((day) => {
          const rect = day.getBoundingClientRect();
          return (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
          );
        }),
        nearest = days.sort((a, b) => {
          const ar = a.getBoundingClientRect(),
            br = b.getBoundingClientRect();
          return (
            Math.hypot(
              x - (ar.left + ar.width / 2),
              y - (ar.top + ar.height / 2),
            ) -
            Math.hypot(
              x - (br.left + br.width / 2),
              y - (br.top + br.height / 2),
            )
          );
        })[0];
      targetDate = (containing ?? nearest)?.dataset.dropDate ?? targetDate;
    }
    const source = week.sessions.find(
      (session) => session.id === String(event.active.id),
    );
    if (targetDate && source && targetDate !== source.date)
      move(String(event.active.id), targetDate);
  };
  return (
    <section id="full-schedule">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="eyebrow">PLAN</p>
          <h2 className="section-title">Full schedule</h2>
        </div>
        <p className="hidden text-xs text-[var(--muted)] sm:block">
          Drag workouts between days using the grip handle.
        </p>
      </div>
      <DndContext collisionDetection={closestCenter} onDragEnd={dropped}>
        <div className="schedule-week">
          {Array.from({ length: 7 }, (_, index) => {
            const date = plusDays(week.startDate, index),
              sessions = week.sessions.filter(
                (session) => session.date === date,
              );
            return (
              <Day
                key={date}
                date={date}
                wfh={week.planningContext?.wfhDays.includes(index) ?? false}
                sessions={sessions}
                rest={week.restDays?.includes(date) ?? false}
                edit={edit}
                update={update}
                complete={complete}
                add={add}
                setRestDay={setRestDay}
                openMenu={setMenuSession}
              />
            );
          })}
        </div>
      </DndContext>
      {menuSession && (
        <WorkoutActionSheet
          session={menuSession}
          edit={edit}
          update={update}
          duplicate={duplicate}
          repeat={repeat}
          remove={remove}
          close={() => setMenuSession(null)}
        />
      )}
    </section>
  );
}

function Day({
  date,
  wfh,
  sessions,
  rest,
  edit,
  update,
  complete,
  add,
  setRestDay,
  openMenu,
}: {
  date: string;
  wfh: boolean;
  sessions: Session[];
  rest: boolean;
  edit: (session: Session) => void;
  update: (session: Session) => void;
  complete: (id: string) => void;
  add: (date: string) => void;
  setRestDay: (date: string, rest: boolean) => void;
  openMenu: (session: Session) => void;
}) {
  const today = date === iso(new Date()),
    { setNodeRef, isOver } = useDroppable({ id: date });
  return (
    <article
      ref={setNodeRef}
      data-drop-date={date}
      className={`day ${today ? "is-today" : ""} ${isOver ? "drop-target" : ""} ${rest ? "is-rest" : ""}`}
    >
      <header className="day-heading">
        <div>
          <p className="day-name">{dayFmt.format(parse(date))}</p>
          <p className="day-date">{dateFmt.format(parse(date))}</p>
        </div>
        <div className="day-badges">
          {rest && <span className="rest-badge"><Moon size={12}/> Rest day</span>}
          {wfh && <span className="wfh-badge">WFH</span>}
          {sessions.length > 1 && (
            <span className="session-count">{sessions.length} sessions</span>
          )}
          {today && <span className="today-label">Today</span>}
        </div>
      </header>
      <div className="day-body">
        <div className="day-sessions">
          {sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              edit={edit}
              update={update}
              complete={complete}
              openMenu={openMenu}
            />
          ))}
        </div>
        <div className="day-actions">
          {!rest && <button className="add" onClick={() => add(date)}>
            <Plus size={14} /> Add session
          </button>}
          <button className="rest-day-action" onClick={() => setRestDay(date, !rest)}>
            <Moon size={14} /> {rest ? "Remove rest day" : "Mark as rest day"}
          </button>
        </div>
      </div>
    </article>
  );
}
function SessionItem({
  session,
  edit,
  update,
  complete,
  openMenu,
}: {
  session: Session;
  edit: (session: Session) => void;
  update: (session: Session) => void;
  complete: (id: string) => void;
  openMenu: (session: Session) => void;
}) {
  const Icon = sessionIcon(session.category),
    { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable(
      { id: session.id, disabled: Boolean(session.locked) },
    ),
    style = transform
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
      : undefined;
  const open = () => edit(session);
  const activityMetrics = [
    session.activityStats?.elevationGainM !== undefined
      ? `${Math.round(session.activityStats.elevationGainM)} m climb`
      : undefined,
    session.activityStats?.averagePowerWatts !== undefined
      ? `${Math.round(session.activityStats.averagePowerWatts)} W avg`
      : undefined,
    session.activityStats?.averageHeartRate !== undefined
      ? `${Math.round(session.activityStats.averageHeartRate)} bpm`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  const activityTags = (session.activityTags ?? [])
    .filter((tag) => tag !== "power recorded")
    .slice(0, 3);
  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "button,summary,details,a,input,select,textarea",
          )
        )
          return;
        open();
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          open();
        }
      }}
      aria-label={`Edit ${session.title}`}
      className={`session session-open ${kind(session.category)} ${session.completed ? "completed" : ""} ${session.skipped ? "skipped" : ""} ${isDragging ? "dragging" : ""}`}
    >
      <div className="flex gap-2">
        <Icon size={15} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <b className="session-title text-sm">{session.title}</b>
          <p className="session-summary">
            {sessionTarget(session)}
            {session.exercises?.length ? (
              <> · {session.exercises.length} exercises</>
            ) : null}
          </p>
          {(activityMetrics.length > 0 || activityTags.length > 0) && (
            <div className="session-activity-details" aria-label="Strava workout details">
              {activityMetrics.map((metric) => (
                <span className="activity-metric" key={metric}>{metric}</span>
              ))}
              {activityTags.map((tag) => (
                <span className="activity-tag" key={tag}>{tag}</span>
              ))}
            </div>
          )}
          <div className="session-badges">
            {session.skipped && (
              <span className="session-status skipped-status">
                <CircleSlash2 size={11} /> Skipped
              </span>
            )}
            {session.stravaActivityId && (
              <span className="strava-linked">
                <Link2 size={11} /> Strava matched
              </span>
            )}
          </div>
        </div>
        <button
          className="drag-handle"
          disabled={session.locked}
          onClick={(event) => event.stopPropagation()}
          aria-label={
            session.locked
              ? `${session.title} is locked`
              : `Drag ${session.title}`
          }
          {...listeners}
          {...attributes}
        >
          {session.locked ? <Lock size={15} /> : <GripVertical size={17} />}
        </button>
      </div>
      <div
        className="session-controls"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className={`complete-action ${session.completed ? "done" : ""}`}
          onClick={() => complete(session.id)}
        >
          <Check size={14} />
          <span>{session.completed ? "Completed" : "Complete"}</span>
        </button>
        <div className="session-menu">
          <button
            type="button"
            className="session-menu-trigger"
            aria-label={`More actions for ${session.title}`}
            title="More actions"
            onClick={() => openMenu(session)}
          >
            <EllipsisVertical size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkoutActionSheet({
  session,
  edit,
  update,
  duplicate,
  repeat,
  remove,
  close,
}: {
  session: Session;
  edit: (session: Session) => void;
  update: (session: Session) => void;
  duplicate: (session: Session) => void;
  repeat: (session: Session) => void;
  remove: (session: Session) => void;
  close: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    dragStart = useRef<number | null>(null);
  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (panel.current) panel.current.style.transition = "none";
  };
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStart.current === null || !panel.current) return;
    panel.current.style.transform = `translateY(${Math.max(0, event.clientY - dragStart.current)}px)`;
  };
  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragStart.current === null) return;
    const distance = Math.max(0, event.clientY - dragStart.current),
      node = panel.current;
    dragStart.current = null;
    if (!node) return;
    node.style.transition = "transform .18s ease-out";
    if (distance > 70) {
      node.style.transform = "translateY(100%)";
      window.setTimeout(close, 180);
    } else {
      node.style.transform = "translateY(0)";
      window.setTimeout(() => {
        node.style.transition = "";
      }, 180);
    }
  };
  return (
    <>
      <button
        type="button"
        className="session-menu-backdrop"
        aria-label="Close workout actions"
        onClick={close}
      />
      <div
        ref={panel}
        className="session-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${session.title}`}
      >
        <button
          type="button"
          className="sheet-grab"
          aria-label="Swipe down to close workout actions"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <span />
        </button>
        <header className="session-menu-head">
          <div>
            <small>WORKOUT</small>
            <b>{session.title}</b>
          </div>
          <button
            type="button"
            aria-label="Close workout actions"
            onClick={close}
          >
            <X size={18} />
          </button>
        </header>
        <button
          type="button"
          className="edit-workout"
          onClick={() => {
            close();
            edit(session);
          }}
        >
          <Pencil size={14} />
          Edit workout
        </button>
        <button
          type="button"
          className={session.skipped ? "restore-workout" : "skip-workout"}
          onClick={() => {
            update({ ...session, skipped: !session.skipped, completed: false });
            close();
          }}
        >
          <CircleSlash2 size={14} />
          {session.skipped ? "Restore workout" : "Mark as skipped"}
        </button>
        <button
          type="button"
          onClick={() => {
            update({ ...session, locked: !session.locked });
            close();
          }}
        >
          <Lock size={14} />
          {session.locked ? "Unlock" : "Lock"}
        </button>
        <button
          type="button"
          onClick={() => {
            duplicate(session);
            close();
          }}
        >
          <Copy size={14} />
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => {
            repeat(session);
            close();
          }}
        >
          <Repeat2 size={14} />
          Repeat weekly
        </button>
        <button
          type="button"
          className="delete"
          onClick={() => {
            remove(session);
            close();
          }}
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </>
  );
}


