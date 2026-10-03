import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Activity,
  Bike,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  Dumbbell,
  History as HistoryIcon,
  Home,
  Info,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Repeat2,
  RotateCcw,
  Save,
  Settings,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  closestCenter,
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  buildGeneratedWeek,
  cloneSession,
  closeElapsedDays,
  copyWeekToStart,
  iso,
  kind,
  makeWeek,
  makeWfhWeek,
  replaceCalendarWeek,
  repeatSessionAcrossWeeks,
  sessionTarget,
} from "./data";
import type {
  Category,
  ExternalActivity,
  Habit,
  Session,
  TrainingWeek,
} from "./types";
import {
  clearStore,
  createDefaultHabits,
  dedupeHabits,
  readStore,
  sanitizePlannerStore,
  validateBackup,
  writeStore,
  type AppTheme,
  type PlannerStore,
} from "./storage";
import { workoutPresets, type WorkoutPreset } from "./presets";
import { matchActivitiesToWeeks, refreshLinkedActivities } from "./activityMatching";
import {
  moveSessionToDate,
  toggleSessionCompletion,
  updateWeekById,
  updateWeekSession,
} from "./scheduleState";
import { canonicalWeekForStart, repairPlannerStore } from "./plannerIntegrity";
import { autoCompleteTrainingHabits } from "./habitAutomation";
import type { User } from "firebase/auth";

const SecondaryTabs = lazy(() => import("./SecondaryTabs"));
const Dashboard = lazy(() => import("./Dashboard"));
const GrowthFeatures = lazy(() => import("./GrowthFeatures"));
const CoachPanel = lazy(() => import("./CoachPanel"));
const sameActivities = (left: ExternalActivity[], right: ExternalActivity[]) =>
  JSON.stringify(left) === JSON.stringify(right);
const Schedule = lazy(() => import("./Schedule"));
const WeeklyInsights = lazy(() =>
  import("./WeeklyInsights").then((module) => ({
    default: module.WeeklyInsights,
  })),
);
const loadAuth = () => import("./firebaseAuth");
const loadPlanner = () => import("./firebasePlanner");

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
type ConfirmationRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};
const categories: Category[] = [
  "Easy run",
  "Speed work",
  "Long run",
  "Upper-body strength",
  "Lower-body strength",
  "Core and accessories",
  "Indoor bike",
];
const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long" }),
  dateFmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  });
type AppTab = "dashboard" | "week" | "habits" | "history" | "settings";
const parse = (s: string) => new Date(s + "T12:00:00");
const plusDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const currentWeekStart = () => {
  const date = new Date(),
    day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return iso(date);
};
const sessionIcon = (c: Category) =>
  kind(c) === "run"
    ? Activity
    : kind(c) === "bike"
      ? Bike
      : kind(c) === "strength"
        ? Dumbbell
        : Moon;
const tabFromLocation = (): AppTab => {
  const value = location.hash.slice(1);
  return value === "dashboard" ||
    value === "week" ||
    value === "habits" ||
    value === "history" ||
    value === "settings"
    ? value
    : "dashboard";
};
const getDeviceId = () => {
  const key = "stride-device-id",
    existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
};

function freshStore(): PlannerStore {
  const w = makeWeek();
  return {
    weeks: [w],
    active: w.id,
    dark: false,
    habits: createDefaultHabits(),
  };
}
function focusCurrentWeek(value: PlannerStore): PlannerStore {
  const today = new Date(),
    day = today.getDay() || 7;
  today.setDate(today.getDate() - day + 1);
  const startDate = iso(today),
    current = canonicalWeekForStart(value.weeks, startDate, value.active);
  if (current) return { ...value, active: current.id };
  const created = makeWeek(parse(startDate));
  return {
    ...value,
    weeks: [...value.weeks, created].sort((a, b) =>
      a.startDate.localeCompare(b.startDate),
    ),
    active: created.id,
  };
}
function renameSpeedWork(value: PlannerStore): PlannerStore {
  value = sanitizePlannerStore(value);
  const weeks = value.weeks.map((week) => {
    const sessions = week.sessions
      .filter(
        (session) =>
          !(
            session.category === "Lower-body strength" &&
            (session.title === "Light Legs" ||
              session.title === "Light lower body")
          ),
      )
      .map((session) => {
        if ((session.category as string) === "Quality run")
          return {
            ...session,
            category: "Speed work" as Category,
            title:
              session.title === "Tempo / intervals" ||
              session.title === "Quality run"
                ? "Speed work"
                : session.title,
          };
        if (session.title === "Shoulders & Core")
          return { ...session, title: "Core" };
        return session;
      });
    return { ...week, sessions };
  });
  return {
    ...value,
    weeks,
    habits: dedupeHabits(
      Array.isArray(value.habits) ? value.habits : createDefaultHabits(),
    ),
  };
}

function cloudStore(value: PlannerStore): PlannerStore {
  const result = { ...value };
  delete result.externalActivities;
  delete result.activitiesSyncedAt;
  return result;
}
const cloudJson = (value: PlannerStore) => JSON.stringify(cloudStore(value));
const applyCloudSnapshot = (
  remote: PlannerStore,
  current: PlannerStore,
): PlannerStore => ({
  ...remote,
  externalActivities: current.externalActivities ?? remote.externalActivities,
  activitiesSyncedAt: current.activitiesSyncedAt ?? remote.activitiesSyncedAt,
});

export default function App() {
  const uiNext = import.meta.env.VITE_UI_NEXT === "true" || (import.meta.env.DEV && new URLSearchParams(location.search).get("ui") === "next");
  const [store, setStore] = useState<PlannerStore>(freshStore),
    [hydrated, setHydrated] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [cloudReady, setCloudReady] = useState(false),
    [syncMessage, setSyncMessage] = useState("Saved on this device"),
    [tab, setTab] = useState<AppTab>(tabFromLocation),
    [coachFocus, setCoachFocus] = useState<"recovery" | "review" | null>(null),
    [recoveryFocus, setRecoveryFocus] = useState(false),
    [activityFocus, setActivityFocus] = useState<string | null>(null),
    [editing, setEditing] = useState<{ session: Session; weekId: string } | null>(null),
    [adding, setAdding] = useState<{ date: string; weekId: string } | null>(null),
    [wfhPlanning, setWfhPlanning] = useState<string | null>(null),
    [repeatSession, setRepeatSession] = useState<{ session: Session; weekId: string } | null>(null);
  const [undoState, setUndoState] = useState<{
    label: string;
    store: PlannerStore;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine),
    [deviceSave, setDeviceSave] = useState<"saving" | "saved" | "error">(
      "saved",
    ),
    [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
      null,
    ),
    [standalone, setStandalone] = useState(
      matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    ),
    [updateReady, setUpdateReady] = useState(false);
  const developmentBackup = useRef(false),
    lastCloud = useRef(""),
    cloudBase = useRef<PlannerStore | null>(null),
    cloudRevision = useRef(0),
    deviceId = useRef(getDeviceId()),
    restoreInProgress = useRef(false),
    observedWeekStart = useRef(currentWeekStart());
  const week = store.weeks.find((w) => w.id === store.active) ?? store.weeks[0],
    planningWeek = wfhPlanning
      ? store.weeks.find((item) => item.id === wfhPlanning)
      : undefined;
  useEffect(() => {
    const load = async () => {
      if (uiNext && import.meta.env.DEV) {
        try {
          const response = await fetch("/__stride-development-backup", { cache: "no-store" });
          if (response.ok) {
            const saved = validateBackup(await response.json());
            developmentBackup.current = true;
            setStore(focusCurrentWeek(repairPlannerStore(renameSpeedWork(saved))));
            setSyncMessage("Development backup ? read only");
            setHydrated(true);
            return;
          }
        } catch (error) {
          console.warn("Could not load development backup", error);
        }
      }
      const saved = await readStore();
      if (saved)
        setStore(focusCurrentWeek(repairPlannerStore(renameSpeedWork(saved))));
      setHydrated(true);
    };
    void load();
  }, [uiNext]);
  useEffect(() => {
    if (!hydrated) return;
    const refreshCalendarWeek = () => {
      const previousStart = observedWeekStart.current,
        nextStart = currentWeekStart();
      if (previousStart === nextStart) return;
      observedWeekStart.current = nextStart;
      setStore((current) => {
        const activeWeek = current.weeks.find((item) => item.id === current.active);
        return activeWeek?.startDate === previousStart
          ? focusCurrentWeek(current)
          : current;
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshCalendarWeek();
    };
    window.addEventListener("focus", refreshCalendarWeek);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refreshCalendarWeek, 60000);
    return () => {
      window.removeEventListener("focus", refreshCalendarWeek);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [hydrated]);

  useEffect(() => {
    const theme = store.theme ?? (store.dark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("theme-leaf", theme === "leaf");
    document.documentElement.dataset.theme = theme;
    if (!hydrated || developmentBackup.current) return;
    let active = true;
    const timer = setTimeout(() => {
      writeStore(store)
        .then(() => {
          if (active) setDeviceSave("saved");
        })
        .catch((error) => {
          console.warn("Could not save planner data", error);
          if (active) setDeviceSave("error");
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [store, hydrated]);
  useEffect(() => {
    if (!hydrated || !online || developmentBackup.current) return;
    let active = true,
      lastFetch = 0;
    const refresh = async () => {
      if (
        !active ||
        document.visibilityState === "hidden" ||
        Date.now() - lastFetch < 60000
      )
        return;
      lastFetch = Date.now();
      try {
        const { fetchStravaActivities } = await import("./stravaSheets"),
          activities = await fetchStravaActivities();
        if (active)
          setStore((current) => {
            const weeks = refreshLinkedActivities(current.weeks, activities),
              activitiesChanged = !sameActivities(current.externalActivities ?? [], activities),
              weeksChanged = weeks !== current.weeks && weeks.some((item, index) => item !== current.weeks[index]);
            return !activitiesChanged && !weeksChanged
              ? current
              : {
                  ...current,
                  weeks,
                  externalActivities: activities,
                  activitiesSyncedAt: new Date().toISOString(),
                };
          });
      } catch (error) {
        console.warn("Could not refresh Strava activities", error);
      }
    };
    refresh();
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    const polling = window.setInterval(refresh, 120000);
    return () => {
      active = false;
      window.clearInterval(polling);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [hydrated, online]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const before = (event: Event) => {
        event.preventDefault();
        setInstallPrompt(event as InstallPromptEvent);
      },
      installed = () => {
        setInstallPrompt(null);
        setStandalone(true);
      };
    addEventListener("beforeinstallprompt", before);
    addEventListener("appinstalled", installed);
    return () => {
      removeEventListener("beforeinstallprompt", before);
      removeEventListener("appinstalled", installed);
    };
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker.ready.then((registration) => {
      if (cancelled) return;
      if (registration.waiting && navigator.serviceWorker.controller)
        setUpdateReady(true);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            setUpdateReady(true);
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    history.replaceState(
      null,
      "",
      tab === "dashboard" ? location.pathname : location.pathname + "#" + tab,
    );
  }, [tab]);
  useEffect(() => {
    const syncTab = () => setTab(tabFromLocation());
    addEventListener("popstate", syncTab);
    addEventListener("hashchange", syncTab);
    return () => {
      removeEventListener("popstate", syncTab);
      removeEventListener("hashchange", syncTab);
    };
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, store.active]);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined,
      cancelled = false;
    const connect = () => {
      if (developmentBackup.current) return;
      loadAuth().then(({ observeAuth }) => {
        if (!cancelled)
          unsubscribe = observeAuth((next) => {
            setUser(next);
            setCloudReady(false);
            lastCloud.current = "";
            cloudBase.current = null;
            cloudRevision.current = 0;
            setSyncMessage(next ? "Connecting..." : "Saved on this device");
          });
      });
    };
    const idle = window.setTimeout(connect, 1500);
    return () => {
      cancelled = true;
      clearTimeout(idle);
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (!user || !hydrated || developmentBackup.current) return;
    let unsubscribe: (() => void) | undefined,
      cancelled = false;
    const timeout = setTimeout(
      () =>
        setSyncMessage(
          "Firestore is not responding  -  check its rules and network access",
        ),
      10000,
    );
    loadPlanner().then(({ observePlanner, savePlanner }) => {
      if (cancelled) return;
      unsubscribe = observePlanner(
        user.uid,
        async (cloud) => {
          clearTimeout(timeout);
          if (restoreInProgress.current) return;
          if (cloud) {
            if (cloud.data.syncProtocolVersion !== 2) {
              cloudRevision.current = cloud.revision;
              setSyncMessage("Updating an older device copy...");
              setStore((current) => {
                loadPlanner()
                  .then(({ replacePlanner }) =>
                    replacePlanner(user.uid, current, deviceId.current),
                  )
                  .then((revision) => {
                    cloudRevision.current = revision;
                    cloudBase.current = cloudStore(current);
                    lastCloud.current = cloudJson(current);
                    setSyncMessage("Synced with Firestore");
                  })
                  .catch(() =>
                    setSyncMessage(
                      "Could not protect data from an older app version",
                    ),
                  );
                return current;
              });
              return;
            }
            const remote = repairPlannerStore(renameSpeedWork(cloud.data)),
              remoteJson = cloudJson(remote);
            cloudRevision.current = cloud.revision;
            if (remoteJson !== lastCloud.current) {
              setStore((current) => {
                const exact = applyCloudSnapshot(remote, current);
                cloudBase.current = remote;
                lastCloud.current = remoteJson;
                return exact;
              });
            }
          } else {
            try {
              const result = await savePlanner(
                user.uid,
                store,
                0,
                deviceId.current,
              );
              if (result.saved) {
                cloudRevision.current = result.revision;
                cloudBase.current = cloudStore(store);
                lastCloud.current = cloudJson(store);
              }
            } catch (error) {
              setSyncMessage(
                error instanceof Error
                  ? `Cloud upload failed: ${error.message}`
                  : "Cloud upload failed",
              );
              return;
            }
          }
          setCloudReady(true);
          setSyncMessage("Synced with Firestore");
        },
        (error) => {
          clearTimeout(timeout);
          setSyncMessage(`Firestore error: ${error.message}`);
        },
      );
    });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      unsubscribe?.();
    };
  }, [user, hydrated]);
  useEffect(() => {
    if (!user || !cloudReady || developmentBackup.current) return;
    const json = cloudJson(store);
    if (json === lastCloud.current) return;
    setSyncMessage("Syncing...");
    let cancelled = false;
    const timer = setTimeout(() => {
      const expected = cloudRevision.current;
      loadPlanner()
        .then(({ savePlanner }) =>
          savePlanner(user.uid, store, expected, deviceId.current),
        )
        .then((result) => {
          if (cancelled) return;
          if (result.saved) {
            cloudRevision.current = result.revision;
            cloudBase.current = cloudStore(store);
            lastCloud.current = json;
            setSyncMessage("Synced with Firestore");
          } else {
            const remote = repairPlannerStore(
              renameSpeedWork(result.current.data),
            );
            cloudRevision.current = result.current.revision;
            cloudBase.current = remote;
            lastCloud.current = cloudJson(remote);
            setSyncMessage("Loaded newer cloud changes");
            setStore((current) => applyCloudSnapshot(remote, current));
          }
        })
        .catch(() => {
          if (!cancelled)
            setSyncMessage(
              "Cloud sync paused  -  changes remain saved on this device",
            );
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [store, user, cloudReady]);
  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };
  const applyUpdate = async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.waiting) {
      setUpdateReady(false);
      return;
    }
    let reloaded = false;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        if (!reloaded) {
          reloaded = true;
          location.reload();
        }
      },
      { once: true },
    );
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  };
  useEffect(() => {
    if (!undoState) return;
    const timer = window.setTimeout(() => setUndoState(null), 10000);
    return () => window.clearTimeout(timer);
  }, [undoState]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!hydrated) return;
    setStore((current) => {
      const habits = autoCompleteTrainingHabits(
        current.habits,
        current.weeks,
        current.externalActivities ?? [],
      );
      return habits === current.habits ? current : { ...current, habits };
    });
  }, [hydrated, store.weeks, store.externalActivities, store.habits]);
  const reconcileUserChange = (changed: PlannerStore): PlannerStore => {
    const active = changed.weeks.find((week) => week.id === changed.active);
    if (
      !active ||
      active.startDate !== currentWeekStart() ||
      !changed.externalActivities?.length
    )
      return changed;
    const weekEnd = plusDays(active.startDate, 6),
      relevantActivities = changed.externalActivities.filter(
        (activity) =>
          activity.date >= active.startDate && activity.date <= weekEnd,
      ),
      result = matchActivitiesToWeeks(
        changed.weeks,
        relevantActivities,
        active.id,
      );
    return result.matched ? { ...changed, weeks: result.weeks } : changed;
  };
  const applyWithUndo = (
    label: string,
    change: (current: PlannerStore) => PlannerStore,
  ) => {
    setUndoState({ label, store });
    setStore((current) => reconcileUserChange(change(current)));
  };
  const setWeekById = (
    weekId: string,
    fn: (week: TrainingWeek) => TrainingWeek,
  ) =>
    setStore((current) => {
      const changed = {
        ...current,
        weeks: updateWeekById(current.weeks, weekId, fn),
      };
      return reconcileUserChange(changed);
    });
  const setWeek = (fn: (week: TrainingWeek) => TrainingWeek) =>
    setWeekById(week.id, fn);
  const update = (session: Session) =>
    setWeek((week) => updateWeekSession(week, session));
  const complete = (id: string) =>
    setWeek((week) => toggleSessionCompletion(week, id));
  const changeRestDay = (date: string, rest: boolean) => {
    const daySessions = week.sessions.filter((session) => session.date === date);
    if (rest && daySessions.some((session) => session.completed)) {
      setNotice("This day already has a completed activity, so it cannot be marked as a rest day.");
      return;
    }
    const activeSessions = daySessions.filter((session) => !session.skipped);
    const apply = () =>
      applyWithUndo(rest ? "Rest day set" : "Rest day removed", (current) => ({
        ...current,
        weeks: current.weeks.map((item) => {
          if (item.id !== week.id) return item;
          const savedIds = item.restDaySkippedSessionIds?.[date] ?? [];
          const affectedIds = rest
            ? item.sessions
                .filter((session) => session.date === date && !session.completed && !session.skipped)
                .map((session) => session.id)
            : savedIds;
          const skippedByRest = { ...(item.restDaySkippedSessionIds ?? {}) };
          if (rest) skippedByRest[date] = affectedIds;
          else delete skippedByRest[date];
          return {
            ...item,
            restDays: rest
              ? [...new Set([...(item.restDays ?? []), date])].sort()
              : (item.restDays ?? []).filter((value) => value !== date),
            restDaySkippedSessionIds: Object.keys(skippedByRest).length
              ? skippedByRest
              : undefined,
            sessions: item.sessions.map((session) =>
              affectedIds.includes(session.id)
                ? { ...session, skipped: rest, completed: rest ? false : session.completed }
                : session,
            ),
          };
        }),
      }));
    if (rest && activeSessions.length) {
      setConfirmation({
        title: "Mark this as a rest day?",
        message:
          activeSessions.length +
          " planned workout" +
          (activeSessions.length === 1 ? "" : "s") +
          " will be marked as skipped. Removing the rest day will restore them.",
        confirmLabel: "Mark as rest day",
        onConfirm: apply,
      });
    } else apply();
  };
  const copyArchivedWeek = (source: TrainingWeek) => {
    const target = canonicalWeekForStart(
      store.weeks,
      currentWeekStart(),
      store.active,
    );
    if (!target || source.id === target.id) return;
    setConfirmation({
      title: "Replace this week?",
      message: `Use the plan from ${dateFmt.format(parse(source.startDate))}. The archived week will remain unchanged.`,
      confirmLabel: "Replace week",
      onConfirm: () => {
        applyWithUndo("Week replacement", (current) => {
          const copied = {
            ...copyWeekToStart(source, target),
            replacedAt: new Date().toISOString(),
          };
          return {
            ...current,
            weeks: replaceCalendarWeek(current.weeks, copied),
            active: copied.id,
          };
        });
        setTab("week");
      },
    });
  };
  const duplicate = (session: Session) => {
    setWeek((current) => ({
      ...current,
      sessions: [...current.sessions, cloneSession(session)],
    }));
    setNotice(`${session.title} duplicated`);
  };
  const repeat = (session: Session, count: number, sourceWeek: TrainingWeek) => {
    setStore((current) => ({
      ...current,
      weeks: repeatSessionAcrossWeeks(current.weeks, sourceWeek, session, count),
    }));
    setRepeatSession(null);
    setNotice(`${session.title} repeated for ${count} weeks`);
  };

  const generateAdaptiveWeek = async (
    days: number[],
    includeSpeed: boolean,
    useAi: boolean,
    includeLegDay: boolean,
  ) => {
    if (!planningWeek) return;
    const targetGoals = planningWeek.targets ?? store.goals;
    let generated = buildGeneratedWeek(
      parse(planningWeek.startDate),
      days,
      includeSpeed,
      targetGoals,
      planningWeek,
      undefined,
      includeLegDay,
    );
    const { summarizeTrainingHistory } = await import("./aiPlanner"),
      trainingHistory = summarizeTrainingHistory(
        store.weeks,
        planningWeek.startDate,
      );
    const { applyLocalLoadGuard } = await import("./plannerLoad"),
      localDecision = applyLocalLoadGuard(
        generated,
        trainingHistory,
        store.recovery,
        targetGoals,
      );
    generated = localDecision.week;
    let newAiCache: PlannerStore["aiReviewCache"] | undefined;
    if (useAi && user) {
      try {
        const [token, { aiReviewFingerprint, applyAiWeekReview, requestAiWeekReview }] =
          await Promise.all([user.getIdToken(), import("./aiPlanner")]);
        const requestBase = {
          draftWeek: generated,
          trainingHistory,
          wfhDays: days,
          previousWfhDays: trainingHistory[0]?.wfhDays,
          includeSpeedWork: includeSpeed,
          goals: targetGoals,
          recovery: store.recovery,
        };
        const cacheKey = aiReviewFingerprint(requestBase), cached = store.aiReviewCache?.[cacheKey];
        const review = cached && Date.now() - new Date(cached.createdAt).getTime() < 604800000
          ? { ...cached.review, cached: true }
          : await requestAiWeekReview({ ...requestBase, token });
        if (!cached) newAiCache = { ...(store.aiReviewCache ?? {}), [cacheKey]: { review, createdAt: new Date().toISOString() } };
        generated = {
          ...applyAiWeekReview(generated, review, targetGoals),
          planningContext: { wfhDays: days, includeLegDay },
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "The coaching review was unavailable.";
        generated = { ...generated, generationExplanation: [`Fast coaching review unavailable: ${reason} The locally validated plan was used.`, ...(generated.generationExplanation ?? [])] };
      }
    } else if (useAi) {
      generated = { ...generated, generationExplanation: ["Sign in to use the fast coaching review. The locally validated plan was used.", ...(generated.generationExplanation ?? [])] };
    }
    generated = closeElapsedDays(generated, planningWeek);
    generated = {
      ...generated,
      targets: targetGoals,
      planningContext: generated.planningContext ?? {
        wfhDays: days,
        includeLegDay,
      },
      replacedAt: new Date().toISOString(),
    };
    applyWithUndo("Generated week", (current) => ({
      ...current,
      weeks: replaceCalendarWeek(current.weeks, generated),
      aiReviewCache: newAiCache ?? current.aiReviewCache,
      active: generated.id,
    }));
    setWfhPlanning(null);
  };
  const navigate = (direction: number) =>
    setStore((current) => {
      const visible =
          current.weeks.find((item) => item.id === current.active) ??
          current.weeks[0],
        targetStart = plusDays(visible.startDate, direction * 7),
        target = canonicalWeekForStart(
          current.weeks,
          targetStart,
          current.active,
        );
      if (target) return { ...current, active: target.id };
      const created = makeWeek(parse(targetStart));
      return {
        ...current,
        weeks: [...current.weeks, created].sort((a, b) =>
          a.startDate.localeCompare(b.startDate),
        ),
        active: created.id,
      };
    });
  const navigateToCurrentWeek = () =>
    setStore((current) => {
      const targetStart = currentWeekStart(),
        target = canonicalWeekForStart(
          current.weeks,
          targetStart,
          current.active,
        );
      if (target) return { ...current, active: target.id };
      const created = makeWeek(parse(targetStart));
      return {
        ...current,
        weeks: [...current.weeks, created].sort((a, b) =>
          a.startDate.localeCompare(b.startDate),
        ),
        active: created.id,
      };
    });
  const restoreArchivedWeek = async (source: TrainingWeek) => {
    const archived: TrainingWeek = {
        ...source,
        sessions: source.sessions.map((session) => ({ ...session })),
        archivedAt: new Date().toISOString(),
      },
      restored = repairPlannerStore({
        ...store,
        weeks: [
          ...store.weeks.filter(
            (week) => week.startDate !== archived.startDate,
          ),
          archived,
        ].sort((a, b) => a.startDate.localeCompare(b.startDate)),
      });
    restoreInProgress.current = true;
    setCloudReady(false);
    setSyncMessage(user ? "Restoring recovered week..." : "Saved on this device");
    setStore(restored);
    try {
      await writeStore(restored);
      if (user) {
        const { replacePlanner } = await loadPlanner(),
          revision = await replacePlanner(user.uid, restored, deviceId.current);
        cloudRevision.current = revision;
        cloudBase.current = cloudStore(restored);
        lastCloud.current = cloudJson(restored);
        setSyncMessage("Synced with Firestore");
      }
    } finally {
      restoreInProgress.current = false;
      setCloudReady(Boolean(user));
    }
  };
  const uploadDevice = async () => {
    if (!user) throw new Error("Sign in before uploading this device.");
    restoreInProgress.current = true;
    setCloudReady(false);
    setSyncMessage("Replacing cloud copy...");
    try {
      const { replacePlanner } = await loadPlanner(),
        revision = await replacePlanner(user.uid, store, deviceId.current);
      cloudRevision.current = revision;
      cloudBase.current = cloudStore(store);
      lastCloud.current = cloudJson(store);
      setSyncMessage("This device is now the cloud copy");
    } finally {
      restoreInProgress.current = false;
      setCloudReady(true);
    }
  };
  const downloadCloud = async () => {
    if (!user) throw new Error("Sign in before downloading the cloud copy.");
    restoreInProgress.current = true;
    setCloudReady(false);
    setSyncMessage("Replacing local copy...");
    try {
      const { loadPlannerSnapshot } = await loadPlanner(),
        cloud = await loadPlannerSnapshot(user.uid);
      if (!cloud) throw new Error("No cloud planner was found.");
      const restored = renameSpeedWork(cloud.data);
      await writeStore(restored);
      setStore(restored);
      cloudRevision.current = cloud.revision;
      cloudBase.current = cloudStore(restored);
      lastCloud.current = cloudJson(restored);
      setSyncMessage("This browser now matches the cloud copy");
    } finally {
      restoreInProgress.current = false;
      setCloudReady(true);
    }
  };
  return (
    <div className={"min-h-screen bg-[var(--bg)] text-[var(--ink)]" + (uiNext ? " ui-next" : "")}>
      <Header
        tab={tab}
        setTab={setTab}
        theme={store.theme ?? (store.dark ? "dark" : "light")}
        uiNext={uiNext}
        setTheme={(theme) =>
          setStore((s) => ({ ...s, theme, dark: theme === "dark" }))
        }
      />
      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-7 sm:px-7">
        {tab === "dashboard" && (
          <Suspense
            fallback={
              <div className="panel text-sm text-[var(--muted)]">
                Loading dashboard...
              </div>
            }
          >
            <Dashboard
              store={store}
              uiNext={uiNext}
              openPlanner={() => setTab("week")}
              openSettings={() => setTab("settings")}
              openHabits={() => setTab("habits")}
              openCoach={(focus) => {
                if (focus === "recovery") setRecoveryFocus(true);
                else setCoachFocus(focus);
                setTab("week");
              }}
              openWorkout={(activityId) => {
                setActivityFocus(activityId);
                setTab("history");
              }}
              toggleWorkout={(weekId, sessionId) =>
                setWeekById(weekId, (selectedWeek) =>
                  toggleSessionCompletion(selectedWeek, sessionId),
                )
              }
            />
          </Suspense>
        )}
        {tab === "week" && (
          <div className="week-page">
            <WeekHead
              week={week}
              prev={() => navigate(-1)}
              next={() => navigate(1)}
              current={navigateToCurrentWeek}
              planWfh={() => setWfhPlanning(week.id)}
              reset={() => {
                setConfirmation({
                  title: "Reset this week?",
                  message:
                    "Replace this week's sessions with a fresh plan using the same planning preferences.",
                  confirmLabel: "Reset week",
                  destructive: true,
                  onConfirm: () => {
                    const resetDays = week.planningContext?.wfhDays ?? [],
                      includeLegDay =
                        week.planningContext?.includeLegDay ?? true,
                      nw = {
                        ...makeWfhWeek(
                          parse(week.startDate),
                          resetDays,
                          false,
                          includeLegDay,
                        ),
                        id: week.id,
                        targets: week.targets ?? store.goals,
                        planningContext: {
                          ...week.planningContext,
                          wfhDays: resetDays,
                          includeLegDay,
                        },
                        replacedAt: new Date().toISOString(),
                      };
                    applyWithUndo("Week reset", (current) => ({
                      ...current,
                      weeks: replaceCalendarWeek(current.weeks, nw),
                      active: nw.id,
                    }));
                  },
                });
              }}
            />
            <Today
              week={week}
              update={update}
              complete={complete}
              habits={store.habits}
              setHabits={(habits) => setStore((s) => ({ ...s, habits }))}
            />
            <Progress week={week} />
            <Suspense fallback={null}>
              <CoachPanel store={store} week={week} setStore={setStore} applyWithUndo={applyWithUndo} uiNext={uiNext} focus={coachFocus} onFocusHandled={()=>setCoachFocus(null)} />
              <GrowthFeatures store={store} week={week} setStore={setStore} focusRecovery={recoveryFocus} onRecoveryFocusHandled={()=>setRecoveryFocus(false)} />
            </Suspense>
            <DeferredSchedule
              week={week}
              edit={(session) => setEditing({ session, weekId: week.id })}
              update={update}
              complete={complete}
              add={(date) => setAdding({ date, weekId: week.id })}
              setRestDay={changeRestDay}
              duplicate={duplicate}
              repeat={(session) => setRepeatSession({ session, weekId: week.id })}
              remove={(session) => {
                setConfirmation({
                  title: "Delete workout?",
                  message: `Remove ${session.title} from this week. You can undo this afterwards.`,
                  confirmLabel: "Delete workout",
                  destructive: true,
                  onConfirm: () =>
                    applyWithUndo("Workout deleted", (current) => ({
                      ...current,
                      weeks: current.weeks.map((item) =>
                        item.id === week.id
                          ? {
                              ...item,
                              sessions: item.sessions.filter(
                                (value) => value.id !== session.id,
                              ),
                            }
                          : item,
                      ),
                    })),
                });
              }}
              move={(id, date) => {
                setWeek((week) => moveSessionToDate(week, id, date));
                setNotice(`Workout moved to ${dateFmt.format(parse(date))}`);
              }}
            />
            <PlanExplanation week={week} />
            <DeferredInsights
              week={week}
              weeks={store.weeks}
              habits={store.habits}
              activities={store.externalActivities ?? []}
              recovery={store.recovery ?? []}
            />
          </div>
        )}
        {(tab === "habits" || tab === "history" || tab === "settings") && (
          <Suspense
            fallback={
              <div className="panel text-sm text-[var(--muted)]">Loading...</div>
            }
          >
            <SecondaryTabs
              tab={tab}
              uiNext={uiNext}
              activityFocus={activityFocus}
              onActivityFocusHandled={() => setActivityFocus(null)}
              habits={store.habits}
              setHabits={(habits) => setStore((s) => ({ ...s, habits }))}
              weeks={store.weeks}
              currentWeekId={
                canonicalWeekForStart(
                  store.weeks,
                  currentWeekStart(),
                  store.active,
                )?.id
              }
              openWeek={(id) => {
                setStore((s) => ({ ...s, active: id }));
                setTab("week");
              }}
              copyWeek={copyArchivedWeek}
              store={store}
              setStore={setStore}
              user={user}
              syncMessage={syncMessage}
              status={
                <AppStatus
                  online={online}
                  deviceSave={deviceSave}
                  cloud={user ? syncMessage : "Device only"}
                  installAvailable={Boolean(installPrompt) && !standalone}
                  updateReady={updateReady}
                  install={installApp}
                  update={applyUpdate}
                />
              }
              setTheme={(theme) =>
                setStore((s) => ({ ...s, theme, dark: theme === "dark" }))
              }
              restore={async (value) => {
                const restored = focusCurrentWeek(repairPlannerStore(value));
                restoreInProgress.current = true;
                setCloudReady(false);
                setSyncMessage(
                  user ? "Restoring backup..." : "Saved on this device",
                );
                setStore(restored);
                setTab("week");
                try {
                  await writeStore(restored);
                  if (user) {
                    const { replacePlanner } = await loadPlanner(),
                      revision = await replacePlanner(
                        user.uid,
                        restored,
                        deviceId.current,
                      );
                    cloudRevision.current = revision;
                    cloudBase.current = cloudStore(restored);
                    lastCloud.current = cloudJson(restored);
                    setSyncMessage("Synced with Firestore");
                  }
                } finally {
                  restoreInProgress.current = false;
                  setCloudReady(Boolean(user));
                }
              }}
              restoreWeek={restoreArchivedWeek}
              uploadDevice={uploadDevice}
              downloadCloud={downloadCloud}
              clear={() => {
                setConfirmation({
                  title: "Clear all planner data?",
                  message:
                    "This removes your weeks, sessions, and local planner history from this device.",
                  confirmLabel: "Clear all data",
                  destructive: true,
                  onConfirm: () => {
                    setUndoState({ label: "Planner data cleared", store });
                    const w = makeWeek();
                    clearStore().finally(() =>
                      setStore({
                        weeks: [w],
                        active: w.id,
                        dark: store.dark,
                        theme: store.theme,
                        habits: createDefaultHabits(),
                      }),
                    );
                    setTab("week");
                  },
                });
              }}
            />
          </Suspense>
        )}
      </main>
      {(editing || adding) && (
        <SimpleEditModal
          session={editing?.session ?? null}
          date={adding?.date ?? editing!.session.date}
          customWorkouts={store.customWorkouts ?? []}
          saveCustom={(preset, previousName) =>
            setStore((current) => ({
              ...current,
              customWorkouts: [
                ...(current.customWorkouts ?? []).filter(
                  (item) =>
                    ![previousName, preset.name]
                      .filter(Boolean)
                      .map((name) => name!.toLowerCase())
                      .includes(item.name.toLowerCase()),
                ),
                preset,
              ],
            }))
          }
          removeCustom={(name) =>
            setStore((current) => ({
              ...current,
              customWorkouts: (current.customWorkouts ?? []).filter(
                (item) => item.name.toLowerCase() !== name.toLowerCase(),
              ),
            }))
          }
          close={() => {
            setEditing(null);
            setAdding(null);
            setNotice(editing ? "Workout updated" : "Workout added");
          }}
          save={(s) => {
            const targetWeekId = editing?.weekId ?? adding?.weekId;
            if (!targetWeekId) return;
            setWeekById(targetWeekId, (targetWeek) =>
              editing
                ? updateWeekSession(targetWeek, s)
                : { ...targetWeek, sessions: [...targetWeek.sessions, s] },
            );
            setEditing(null);
            setAdding(null);
          }}
          remove={
            editing
              ? () => {
                  applyWithUndo("Workout deleted", (current) => ({
                    ...current,
                    weeks: current.weeks.map((item) =>
                      item.id === editing.weekId
                        ? {
                            ...item,
                            sessions: item.sessions.filter(
                              (value) => value.id !== editing.session.id,
                            ),
                          }
                        : item,
                    ),
                  }));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}{" "}
      {repeatSession && (
        <RepeatPlanner
          session={repeatSession.session}
          close={() => setRepeatSession(null)}
          repeat={(count) => {
            const sourceWeek = store.weeks.find((item) => item.id === repeatSession.weekId);
            if (sourceWeek) repeat(repeatSession.session, count, sourceWeek);
          }}
        />
      )}{" "}
      {planningWeek && (
        <WfhPlanner
          initialDays={planningWeek.planningContext?.wfhDays ?? []}
          initialIncludeLegDay={
            planningWeek.planningContext?.includeLegDay ?? true
          }
          protectedCount={
            planningWeek.sessions.filter(
              (session) => session.locked || session.completed,
            ).length
          }
          replacementCount={
            planningWeek.sessions.filter(
              (session) => !session.locked && !session.completed,
            ).length
          }
          targetLabel={`${dateFmt.format(parse(planningWeek.startDate))}  -  ${dateFmt.format(parse(plusDays(planningWeek.startDate, 6)))}`}
          aiAvailable={Boolean(user)}
          close={() => setWfhPlanning(null)}
          generate={generateAdaptiveWeek}
        />
      )}
      {undoState && (
        <aside className="undo-toast" role="status">
          <span>{undoState.label}</span>
          <button
            onClick={() => {
              setStore(undoState.store);
              setUndoState(null);
            }}
          >
            Undo
          </button>
        </aside>
      )}
      {notice && !undoState && (
        <aside className="feedback-toast" role="status" aria-live="polite">
          <Check size={16} />
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </aside>
      )}
      {confirmation && (
        <ConfirmDialog
          request={confirmation}
          close={() => setConfirmation(null)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  request,
  close,
}: {
  request: ConfirmationRequest;
  close: () => void;
}) {
  return (
    <div
      className="modal-bg confirmation-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className="modal confirmation-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
      >
        <div className="confirmation-icon">
          <Trash2 size={20} />
        </div>
        <div>
          <p className="eyebrow">PLEASE CONFIRM</p>
          <h2 id="confirmation-title" className="section-title">
            {request.title}
          </h2>
          <p id="confirmation-message" className="confirmation-message">
            {request.message}
          </p>
        </div>
        <div className="confirmation-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className={
              request.destructive ? "danger confirmation-danger" : "primary"
            }
            onClick={() => {
              close();
              request.onConfirm();
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function DeferredInsights(props: ComponentProps<typeof WeeklyInsights>) {
  const container = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);
  return (
    <div ref={container}>
      {ready ? (
        <Suspense fallback={null}>
          <WeeklyInsights {...props} />
        </Suspense>
      ) : null}
    </div>
  );
}
function DeferredSchedule(props: ComponentProps<typeof Schedule>) {
  const container = useRef<HTMLDivElement>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "500px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready]);
  return (
    <div ref={container}>
      {ready ? (
        <Suspense
          fallback={
            <div className="panel text-sm text-[var(--muted)]">
              Loading schedule...
            </div>
          }
        >
          <Schedule {...props} />
        </Suspense>
      ) : (
        <div className="schedule-placeholder" aria-hidden="true">
          <span />
        </div>
      )}
    </div>
  );
}
function AppStatus({
  online,
  deviceSave,
  cloud,
  installAvailable,
  updateReady,
  install,
  update,
}: {
  online: boolean;
  deviceSave: "saving" | "saved" | "error";
  cloud: string;
  installAvailable: boolean;
  updateReady: boolean;
  install: () => void;
  update: () => void;
}) {
  const saveLabel =
      deviceSave === "saving"
        ? "Saving..."
        : deviceSave === "error"
          ? "Save failed"
          : "Saved on device",
    cloudProblem = /failed|error|not responding/i.test(cloud);
  return (
    <aside className="app-status" aria-label="App status">
      <div>
        <span className={`status-chip ${online ? "ok" : "problem"}`}>
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}{" "}
          {online ? "Online" : "Offline"}
        </span>
        <span
          className={`status-chip ${deviceSave === "error" ? "problem" : deviceSave === "saving" ? "working" : "ok"}`}
        >
          <Save size={13} />
          {saveLabel}
        </span>
        <span className={`status-chip ${cloudProblem ? "problem" : ""}`}>
          <Cloud size={13} />
          {cloud}
        </span>
        {installAvailable && (
          <button onClick={install}>
            <Download size={13} />
            Install app
          </button>
        )}
        {updateReady && (
          <button className="update-ready" onClick={update}>
            <RotateCcw size={13} />
            Update ready
          </button>
        )}
      </div>
    </aside>
  );
}
function LeafMark() {
  return (
    <img
      src="/icons/hidden_leaf.svg"
      alt=""
      aria-hidden="true"
      className="leaf-mark"
    />
  );
}
function Header({
  tab,
  setTab: setActiveTab,
  theme,
  setTheme,
  uiNext,
}: {
  tab: AppTab;
  setTab: (tab: AppTab) => void;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  uiNext?: boolean;
}) {
  const items = [
    ["dashboard", LayoutDashboard, "Dashboard"],
    ["week", CalendarDays, "Plan"],
    ["habits", ListChecks, "Habits"],
    ["history", HistoryIcon, "History"],
    ["settings", Settings, "Settings"],
  ] as const;
  if (uiNext) {
    const nextItems = [
      ["dashboard", Home, "Today"],
      ["week", CalendarDays, "Plan"],
      ["history", HistoryIcon, "Progress"],
      ["settings", Settings, "More"],
    ] as const;
    const titles: Record<(typeof nextItems)[number][0], string> = {
      dashboard: "Good morning",
      week: "This week",
      history: "Progress",
      settings: "More",
    };
    const navigateNext = (next: (typeof nextItems)[number][0]) => {
      if (next === tab) return;
      history.pushState(null, "", next === "dashboard" ? location.pathname + location.search : location.pathname + location.search + "#" + next);
      setActiveTab(next);
    };
    return <>
      <header className="ui-next-app-top"><div><span>Stride</span><h1>{titles[(tab === "habits" ? "dashboard" : tab) as keyof typeof titles] ?? "Stride"}</h1></div><button className="icon-btn" aria-label="Toggle light and dark theme" onClick={()=>setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={19}/> : <Moon size={19}/>}</button></header>
      <nav className="ui-next-bottom-nav" aria-label="Primary navigation">{nextItems.map(([id,Icon,label])=><button key={id} className={tab===id?"active":""} aria-current={tab===id?"page":undefined} onClick={()=>navigateNext(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>
    </>;
  }
  const setTab = (next: AppTab) => {
    if (next === tab) return;
    history.pushState(
      null,
      "",
      next === "dashboard" ? location.pathname : location.pathname + "#" + next,
    );
    setActiveTab(next);
  };
  return (
    <>
      <header className="app-header sticky top-0 z-30 border-b border-[var(--line)] bg-[color:var(--bg)/.92] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-7">
          <div className="app-brand">
            {theme === "leaf" ? (
              <span className="leaf-brand">
                <LeafMark />
              </span>
            ) : (
              <img
                src="/icons/icon-192.png"
                alt=""
                className="size-9 rounded-xl"
              />
            )}
            <div>
              <div className="font-display text-lg font-bold leading-none">
                STRIDE
              </div>
              <div className="app-brand-subtitle">TRAINING PLANNER</div>
            </div>
          </div>
          <button
            title="Change colour scheme"
            aria-label="Toggle light and dark theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="icon-btn"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <nav className="app-nav" aria-label="Primary navigation">
        {items.map(([id, I, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`nav ${tab === id ? "active" : ""}`}
            aria-current={tab === id ? "page" : undefined}
          >
            <I size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
function PlanExplanation({ week }: { week: TrainingWeek }) {
  const [open, setOpen] = useState(false),
    items = week.generationExplanation ?? [];
  if (!items.length) return null;
  return (
    <section className="plan-explanation mb-6">
      <button
        className="plan-explanation-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>
          <Info size={17} />
        </span>
        <div>
          <p className="eyebrow">GENERATED PLAN</p>
          <h2 className="section-title">Why this plan?</h2>
        </div>
        <ChevronDown
          size={18}
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>
      {open && (
        <ul>
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
function WeekHead({
  week,
  prev,
  next,
  current,
  planWfh,
  reset,
}: {
  week: TrainingWeek;
  prev: () => void;
  next: () => void;
  current: () => void;
  planWfh: () => void;
  reset: () => void;
}) {
  const end = plusDays(week.startDate, 6),
    isCurrentWeek = week.startDate === currentWeekStart();
  return (
    <section className="week-head">
      <div className="week-head-copy">
        <p className="eyebrow">YOUR TRAINING</p>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          {isCurrentWeek
            ? "This week"
            : `Week of ${dateFmt.format(parse(week.startDate))}`}
        </h1>
        <p>
          {dateFmt.format(parse(week.startDate))}  -  {dateFmt.format(parse(end))}
        </p>
      </div>
      <div className="week-head-actions">
        <div className="week-navigation" aria-label="Change displayed week">
          <button
            className="icon-btn"
            onClick={prev}
            aria-label="Previous week"
            title="Previous week"
          >
            <ChevronLeft size={18} />
          </button>
          {!isCurrentWeek && (
            <button className="secondary week-today-action" onClick={current}>
              This week
            </button>
          )}
          <button
            className="icon-btn"
            onClick={next}
            aria-label="Next week"
            title="Next week"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button className="primary plan-week-action" onClick={planWfh}>
          <Home size={15} />
          <span>Generate week</span>
        </button>
        <button className="secondary reset-week-action" onClick={reset}>
          <RotateCcw size={15} />
          <span>Reset</span>
        </button>
      </div>
    </section>
  );
}
function Today({
  week,
  update,
  complete,
  habits,
  setHabits,
}: {
  week: TrainingWeek;
  update: (s: Session) => void;
  complete: (id: string) => void;
  habits: Habit[];
  setHabits: (habits: Habit[]) => void;
}) {
  const today = iso(new Date()),
    tomorrow = plusDays(today, 1),
    sessions = week.sessions.filter((s) => s.date === today),
    next = week.sessions.filter((s) => s.date === tomorrow && !s.skipped);
  const toggleHabit = (habit: Habit) =>
    setHabits(
      habits.map((item) =>
        item.id === habit.id
          ? {
              ...item,
              completedDates: item.completedDates.includes(today)
                ? item.completedDates.filter((date) => date !== today)
                : [...item.completedDates, today],
            }
          : item,
      ),
    );
  if (!sessions.length && !habits.length && !next.length) return null;
  return (
    <section className="today mb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-lime-300">TODAY</p>
          <h2 className="font-display text-2xl font-bold">
            Ready when you are.
          </h2>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
          {sessions.filter((s) => !s.skipped).length} session
          {sessions.filter((s) => !s.skipped).length === 1 ? "" : "s"}
        </span>
      </div>
      {sessions.length ? (
        <div className="today-session-grid grid gap-3 md:grid-cols-2">
          {sessions.map((s) => (
            <Quick key={s.id} s={s} update={update} complete={complete} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-white/[.06] p-3 text-sm text-slate-300">
          No workout scheduled today.
        </p>
      )}
      <div className="today-footer">
        <div>
          <p className="today-label">HABITS</p>
          <div className="today-habits">
            {habits.map((habit) => {
              const done = habit.completedDates.includes(today);
              return (
                <button
                  key={habit.id}
                  aria-label={`${done ? "Untick" : "Tick"} ${habit.name} today`}
                  title={habit.name}
                  className={`today-habit ${done ? "done" : ""}`}
                  style={
                    { "--habit-color": habit.color } as React.CSSProperties
                  }
                  onClick={() => toggleHabit(habit)}
                >
                  <span />
                  {habit.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="tomorrow-preview">
          <p className="today-label">TOMORROW</p>
          {next.length ? (
            next.map((session) => <span key={session.id}>{session.title}</span>)
          ) : (
            <span>Nothing scheduled</span>
          )}
        </div>
      </div>
    </section>
  );
}
function Quick({
  s,
  update,
  complete,
}: {
  s: Session;
  update: (s: Session) => void;
  complete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    I = sessionIcon(s.category);
  const metric = (
    planned: "plannedDurationMinutes" | "plannedDistanceKm",
    actual: "actualDurationMinutes" | "actualDistanceKm",
    value: string,
  ) =>
    update({
      ...s,
      [planned]: value ? +value : undefined,
      [actual]: value ? +value : undefined,
    });
  return (
    <article
      className={`today-session ${s.completed ? "is-complete" : ""} ${s.skipped ? "is-skipped" : ""}`}
    >
      <div className="today-session-head">
        <span className={`type-icon ${kind(s.category)}`}>
          <I size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate">{s.title}</b>
          <p className="text-xs text-slate-400">
            {sessionTarget(s)}  / {" "}
            <span className="capitalize">{s.intensity}</span>
          </p>
        </div>
        <button
          aria-label={`${open ? "Close" : "Open"} check-in for ${s.title}`}
          onClick={() => setOpen((value) => !value)}
          className="today-expand"
        >
          Check in{" "}
          <ChevronDown size={14} className={open ? "rotate-180" : ""} />
        </button>
      </div>
      <div className="today-actions">
        <button
          onClick={() => complete(s.id)}
          className={s.completed ? "done" : ""}
        >
          <Check size={14} />
          {s.completed ? "Completed" : "Complete"}
        </button>
        <button
          onClick={() =>
            update({ ...s, skipped: !s.skipped, completed: false })
          }
          className={s.skipped ? "skipped" : ""}
        >
          {s.skipped ? "Skipped" : "Skip"}
        </button>
      </div>
      {open && (
        <div className="today-fields">
          <label>
            Minutes
            <input
              inputMode="numeric"
              type="number"
              min="0"
              value={s.actualDurationMinutes ?? s.plannedDurationMinutes ?? ""}
              onChange={(event) =>
                metric(
                  "plannedDurationMinutes",
                  "actualDurationMinutes",
                  event.target.value,
                )
              }
            />
          </label>
          <label>
            Km
            <input
              inputMode="decimal"
              type="number"
              step="0.1"
              min="0"
              value={s.actualDistanceKm ?? s.plannedDistanceKm ?? ""}
              onChange={(event) =>
                metric(
                  "plannedDistanceKm",
                  "actualDistanceKm",
                  event.target.value,
                )
              }
            />
          </label>
          <label className="note">
            Note
            <textarea
              rows={2}
              placeholder="How did it feel?"
              value={s.notes ?? ""}
              onChange={(event) => update({ ...s, notes: event.target.value })}
            />
          </label>
        </div>
      )}
    </article>
  );
}
function Progress({ week }: { week: TrainingWeek }) {
  const active = week.sessions.filter((s) => s.category !== "Walk or mobility"),
    done = active.filter((s) => s.completed),
    runKm = done
      .filter((s) => kind(s.category) === "run")
      .reduce(
        (a, s) => a + (s.actualDistanceKm ?? s.plannedDistanceKm ?? 0),
        0,
      ),
    bikeKm = done
      .filter((s) => kind(s.category) === "bike")
      .reduce(
        (a, s) => a + (s.actualDistanceKm ?? s.plannedDistanceKm ?? 0),
        0,
      ),
    pct = Math.round((done.length / active.length) * 100) || 0;
  return (
    <section className="week-progress panel mb-6">
      <div className="week-progress-main">
        <div>
          <p className="eyebrow">WEEKLY PROGRESS</p>
          <h2 className="section-title">
            {done.length} of {active.length} workouts complete
          </h2>
        </div>
        <strong>{pct}%</strong>
      </div>
      <div className="week-progress-bar">
        <span style={{ width: pct + "%" }} />
      </div>
      <div className="week-progress-stats">
        <span>
          <b>{runKm.toFixed(1)} km</b>
          <small>running completed</small>
        </span>
        <span>
          <b>{bikeKm.toFixed(1)} km</b>
          <small>cycling completed</small>
        </span>
      </div>
    </section>
  );
}
function RepeatPlanner({
  session,
  close,
  repeat,
}: {
  session: Session;
  close: () => void;
  repeat: (count: number) => void;
}) {
  const [count, setCount] = useState(4);
  return (
    <div
      className="modal-bg"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className="modal max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">REPEAT WORKOUT</p>
            <h2 className="section-title">Repeat {session.title} weekly</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Copies stay on the same weekday. Existing identical workouts are
              left unchanged.
            </p>
          </div>
          <button className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="repeat-options">
          {[2, 4, 8, 12].map((option) => (
            <button
              key={option}
              className={count === option ? "selected" : ""}
              onClick={() => setCount(option)}
            >
              <b>{option}</b>
              <span>weeks</span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" onClick={() => repeat(count)}>
            <Repeat2 size={15} /> Add {count} repeats
          </button>
        </div>
      </div>
    </div>
  );
}

function WfhPlanner({
  close,
  generate,
  protectedCount,
  replacementCount,
  targetLabel,
  aiAvailable,
  initialDays,
  initialIncludeLegDay,
}: {
  close: () => void;
  generate: (
    days: number[],
    includeSpeed: boolean,
    useAi: boolean,
    includeLegDay: boolean,
  ) => Promise<void>;
  protectedCount: number;
  replacementCount: number;
  targetLabel: string;
  aiAvailable: boolean;
  initialDays: number[];
  initialIncludeLegDay: boolean;
}) {
  const [days, setDays] = useState<number[]>(initialDays);
  const [includeSpeed, setIncludeSpeed] = useState(false);
  const [includeLegDay, setIncludeLegDay] = useState(initialIncludeLegDay);
  const [useAi, setUseAi] = useState(aiAvailable);
  const [loading, setLoading] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const legDayToggle = (
    <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <span>
        <b className="text-sm">Include dedicated leg day</b>
        <span className="block text-xs text-[var(--muted)]">
          Turn off when running and cycling already provide enough lower-body
          work.
        </span>
      </span>
      <input
        type="checkbox"
        className="toggle"
        disabled={loading}
        checked={includeLegDay}
        onChange={(event) => setIncludeLegDay(event.target.checked)}
      />
    </label>
  );
  const [error, setError] = useState("");
  const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const toggle = (day: number) =>
    setDays((value) =>
      value.includes(day)
        ? value.filter((item) => item !== day)
        : value.length < 2
          ? [...value, day]
          : value,
    );
  const submit = async () => {
    if (replacementCount > 0 && !confirmReplace) {
      setConfirmReplace(true);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await generate(days, includeSpeed, useAi, includeLegDay);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The week could not be generated.",
      );
      setLoading(false);
    }
  };
  return (
    <div
      className="modal-bg"
      onMouseDown={(event) =>
        !loading && event.target === event.currentTarget && close()
      }
    >
      <div className="modal max-w-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow">SMART WEEK</p>
            <h2 className="section-title">
              Which days are you working from home?
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Generating for <b className="text-[var(--ink)]">{targetLabel}</b>.
              Choose up to two WFH days.
            </p>
          </div>
          <button className="icon-btn" disabled={loading} onClick={close}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {labels.map((label, index) => (
            <button
              key={label}
              disabled={loading}
              onClick={() => toggle(index)}
              className={days.includes(index) ? "wfh-day selected" : "wfh-day"}
            >
              <Home size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <span>
            <b className="text-sm">Include speed work</b>
            <span className="block text-xs text-[var(--muted)]">
              Turn off while rebuilding your running base.
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle"
            disabled={loading}
            checked={includeSpeed}
            onChange={(event) => setIncludeSpeed(event.target.checked)}
          />
        </label>
        {legDayToggle}
        <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <span>
            <b className="text-sm">Fast coaching review</b>
            <span className="block text-xs text-[var(--muted)]">
              {aiAvailable
                ? "Reviews the locally valid draft using completed training, recovery and availability. One compact request per changed week."
                : "Sign in to enable the optional coaching review."}
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle"
            disabled={loading || !aiAvailable}
            checked={useAi}
            onChange={(event) => setUseAi(event.target.checked)}
          />
        </label>
        <div className="mt-4 rounded-xl bg-[var(--soft)] p-3 text-xs text-[var(--muted)]">
          <b className="text-[var(--ink)]">Hard rules stay enforced:</b>{" "}
          {includeSpeed
            ? "Speed work is the only session on its day."
            : "Four runs remain, all at easy intensity."}{" "}
          WFH days are preferred for doubles. Bikes never share a day with
          running, doubles pair strength with endurance, Core is paired, and
          every day stays active.
        </div>
        {protectedCount > 0 && (
          <div className="mt-4 rounded-xl border border-lime-500/30 bg-lime-500/10 p-3 text-xs">
            <b>
              {protectedCount} completed or locked session
              {protectedCount === 1 ? "" : "s"} will stay exactly where placed.
            </b>
          </div>
        )}
        {replacementCount > 0 && (
          <div className={`mt-4 rounded-xl border p-3 text-xs ${confirmReplace ? "border-red-500/50 bg-red-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
            <b className="text-[var(--ink)]">
              {replacementCount} existing workout{replacementCount === 1 ? "" : "s"} will be replaced.
            </b>{" "}
            {confirmReplace
              ? "Check the week dates above, then confirm the replacement. You can undo immediately afterwards."
              : "Your week has not been changed yet. Continue to review the replacement first."}
          </div>
        )}
        {error && <p className="activity-message error mt-4">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="secondary"
            disabled={loading}
            onClick={() => confirmReplace ? setConfirmReplace(false) : close()}
          >
            {confirmReplace ? "Back" : "Cancel"}
          </button>
          <button className="primary" disabled={loading} onClick={submit}>
            {loading
              ? "Reviewing draft..."
              : confirmReplace
                ? `Replace ${replacementCount} workout${replacementCount === 1 ? "" : "s"}`
                : replacementCount > 0
                  ? "Review replacement"
                  : useAi
                    ? "Generate with review"
                    : "Generate week"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({
  session,
  date,
  close,
  save,
  remove,
}: {
  session: Session | null;
  date: string;
  close: () => void;
  save: (s: Session) => void;
  remove?: () => void;
}) {
  const [s, setS] = useState<Session>(
    session ?? {
      id: crypto.randomUUID(),
      date,
      category: "Easy run",
      title: "Easy run",
      intensity: "easy",
      completed: false,
      skipped: false,
    },
  );
  const field = (k: keyof Session, v: any) => setS((x) => ({ ...x, [k]: v }));
  return (
    <div
      className="modal-bg"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            kind(s.category) === "run" || kind(s.category) === "bike"
              ? s
              : {
                  ...s,
                  plannedDistanceKm: undefined,
                  actualDistanceKm: undefined,
                },
          );
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="eyebrow">{session ? "UPDATE" : "NEW SESSION"}</p>
            <h2 className="section-title">
              {session ? "Edit workout" : "Add workout"}
            </h2>
          </div>
          <button type="button" className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <WorkoutBuilder session={s} setSession={setS} />
        <div className="form-grid">
          <label>
            Title
            <input
              value={s.title}
              required
              onChange={(e) => field("title", e.target.value)}
            />
          </label>
          <label>
            Category
            <select
              value={s.category}
              onChange={(e) => {
                field("category", e.target.value);
                if (!session) field("title", e.target.value);
              }}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Date / move to day
            <input
              type="date"
              value={s.date}
              onChange={(e) => field("date", e.target.value)}
            />
          </label>
          <label>
            Planned minutes
            <input
              type="number"
              min="0"
              value={s.plannedDurationMinutes ?? ""}
              onChange={(e) =>
                field(
                  "plannedDurationMinutes",
                  e.target.value ? +e.target.value : undefined,
                )
              }
            />
          </label>
          {(kind(s.category) === "run" || kind(s.category) === "bike") && (
            <label>
              Planned km
              <input
                type="number"
                step="0.1"
                min="0"
                value={s.plannedDistanceKm ?? ""}
                onChange={(e) =>
                  field(
                    "plannedDistanceKm",
                    e.target.value ? +e.target.value : undefined,
                  )
                }
              />
            </label>
          )}
          <label>
            Actual minutes
            <input
              type="number"
              min="0"
              value={s.actualDurationMinutes ?? ""}
              onChange={(e) =>
                field(
                  "actualDurationMinutes",
                  e.target.value ? +e.target.value : undefined,
                )
              }
            />
          </label>
          {(kind(s.category) === "run" || kind(s.category) === "bike") && (
            <label>
              Actual km
              <input
                type="number"
                step="0.1"
                min="0"
                value={s.actualDistanceKm ?? ""}
                onChange={(e) =>
                  field(
                    "actualDistanceKm",
                    e.target.value ? +e.target.value : undefined,
                  )
                }
              />
            </label>
          )}
          <label className="full">
            Post-workout note
            <textarea
              rows={3}
              value={s.notes ?? ""}
              placeholder="How did it feel?"
              onChange={(e) => field("notes", e.target.value)}
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className={s.completed ? "primary" : "secondary"}
            onClick={() =>
              setS((x) => ({ ...x, completed: !x.completed, skipped: false, completedAt: !x.completed ? new Date().toISOString() : undefined }))
            }
          >
            <Check size={15} /> {s.completed ? "Completed" : "Mark complete"}
          </button>
          <button
            type="button"
            className={s.skipped ? "danger" : "secondary"}
            onClick={() =>
              setS((x) => ({ ...x, skipped: !x.skipped, completed: false }))
            }
          >
            {s.skipped ? "Skipped" : "Skip"}
          </button>
          <span className="flex-1" />
          {remove && (
            <button type="button" onClick={remove} className="danger">
              Delete workout
            </button>
          )}
          <button className="primary">Save changes</button>
        </div>
      </form>
    </div>
  );
}

function SimpleEditModal({
  session,
  date,
  close,
  save,
  remove,
  customWorkouts,
  saveCustom,
  removeCustom,
}: {
  session: Session | null;
  date: string;
  close: () => void;
  save: (s: Session) => void;
  remove?: () => void;
  customWorkouts: WorkoutPreset[];
  saveCustom: (preset: WorkoutPreset, previousName?: string) => void;
  removeCustom: (name: string) => void;
}) {
  const [s, setS] = useState<Session>(
    session ?? {
      id: crypto.randomUUID(),
      date,
      category: "Easy run",
      title: "Easy run",
      intensity: "easy",
      completed: false,
      skipped: false,
    },
  );
  const field = (key: keyof Session, value: any) =>
    setS((current) => ({ ...current, [key]: value }));
  const metric = (
    planned: "plannedDurationMinutes" | "plannedDistanceKm",
    actual: "actualDurationMinutes" | "actualDistanceKm",
    value: string,
  ) =>
    setS((current) => ({
      ...current,
      [planned]: value ? +value : undefined,
      [actual]: value ? +value : undefined,
    }));
  const sheetRef = useRef<HTMLFormElement>(null),
    sheetDragStart = useRef<number | null>(null);
  const SessionIcon = sessionIcon(s.category),
    sessionKind = kind(s.category),
    showDistance = sessionKind === "run" || sessionKind === "bike";
  const startSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    sheetDragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };
  const moveSheet = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (sheetDragStart.current === null || !sheetRef.current) return;
    sheetRef.current.style.transform = `translateY(${Math.max(0, event.clientY - sheetDragStart.current)}px)`;
  };
  const finishSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (sheetDragStart.current === null) return;
    const distance = Math.max(0, event.clientY - sheetDragStart.current),
      sheet = sheetRef.current;
    sheetDragStart.current = null;
    if (!sheet) return;
    sheet.style.transition = "transform .18s ease-out";
    if (distance > 85) {
      sheet.style.transform = "translateY(100%)";
      window.setTimeout(close, 180);
    } else {
      sheet.style.transform = "translateY(0)";
      window.setTimeout(() => {
        sheet.style.transition = "";
        sheet.style.transform = "";
      }, 180);
    }
  };
  return (
    <div
      className="modal-bg"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <form
        ref={sheetRef}
        className="modal edit-workout-sheet"
        onSubmit={(event) => {
          event.preventDefault();
          save(
            kind(s.category) === "run" || kind(s.category) === "bike"
              ? s
              : {
                  ...s,
                  plannedDistanceKm: undefined,
                  actualDistanceKm: undefined,
                },
          );
        }}
      >
        <button
          type="button"
          className="modal-sheet-grab"
          aria-label="Swipe down to close workout editor"
          onPointerDown={startSheetDrag}
          onPointerMove={moveSheet}
          onPointerUp={finishSheetDrag}
          onPointerCancel={finishSheetDrag}
        >
          <span />
        </button>
        <div className="session-sheet-head">
          <div>
            <p className="eyebrow">{session ? "UPDATE" : "NEW SESSION"}</p>
            <h2 className="section-title">
              {session ? "Edit workout" : "Add workout"}
            </h2>
          </div>
          <span className={"session-type-badge " + sessionKind}>
            <SessionIcon size={15} />
            {sessionKind === "bike"
              ? "Ride"
              : sessionKind === "run"
                ? "Run"
                : sessionKind === "strength"
                  ? "Strength"
                  : "Recovery"}
          </span>
          <button type="button" className="icon-btn" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <WorkoutBuilder
          session={s}
          setSession={setS}
          customWorkouts={customWorkouts}
          saveCustom={saveCustom}
          removeCustom={removeCustom}
        />
        <div className="form-grid session-form-grid">
          <label className="session-name-field">
            Title
            <input
              value={s.title}
              required
              onChange={(event) => field("title", event.target.value)}
            />
          </label>
          <label className="session-category-field">
            Category
            <select
              value={s.category}
              onChange={(event) => {
                field("category", event.target.value);
                if (!session) field("title", event.target.value);
              }}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="session-date-field">
            Date / move to day
            <input
              type="date"
              value={s.date}
              onChange={(event) => field("date", event.target.value)}
            />
          </label>
          <label className="session-metric-field">
            Minutes
            <input
              type="number"
              min="0"
              value={s.actualDurationMinutes ?? s.plannedDurationMinutes ?? ""}
              onChange={(event) =>
                metric(
                  "plannedDurationMinutes",
                  "actualDurationMinutes",
                  event.target.value,
                )
              }
            />
          </label>
          {showDistance && (
            <label className="session-metric-field">
              Km
              <input
                type="number"
                step="0.1"
                min="0"
                value={s.actualDistanceKm ?? s.plannedDistanceKm ?? ""}
                onChange={(event) =>
                  metric(
                    "plannedDistanceKm",
                    "actualDistanceKm",
                    event.target.value,
                  )
                }
              />
            </label>
          )}
          <label className="full session-note-field">
            Post-workout note
            <textarea
              rows={2}
              value={s.notes ?? ""}
              placeholder="How did it feel?"
              onChange={(event) => field("notes", event.target.value)}
            />
          </label>
        </div>
        <div className="session-form-actions">
          <button
            type="button"
            className={s.completed ? "primary" : "secondary"}
            onClick={() =>
              setS((current) => ({
                ...current,
                completed: !current.completed,
                skipped: false,
                completedAt: !current.completed ? new Date().toISOString() : undefined,
              }))
            }
          >
            <Check size={15} /> {s.completed ? "Completed" : "Mark complete"}
          </button>
          <button
            type="button"
            className={s.skipped ? "danger" : "secondary"}
            onClick={() =>
              setS((current) => ({
                ...current,
                skipped: !current.skipped,
                completed: false,
              }))
            }
          >
            {s.skipped ? "Skipped" : "Skip"}
          </button>
          <span className="flex-1" />
          {remove && (
            <button type="button" onClick={remove} className="danger">
              Delete workout
            </button>
          )}
          <button className="primary">
            {session ? "Save changes" : "Add session"}
          </button>
        </div>
      </form>
    </div>
  );
}

function WorkoutBuilder({
  session,
  setSession,
  customWorkouts = [],
  saveCustom,
  removeCustom,
}: {
  session: Session;
  setSession: (value: Session | ((s: Session) => Session)) => void;
  customWorkouts?: WorkoutPreset[];
  saveCustom?: (preset: WorkoutPreset, previousName?: string) => void;
  removeCustom?: (name: string) => void;
}) {
  const [editingPreset, setEditingPreset] = useState<string | null>(null),
    [templateName, setTemplateName] = useState(""),
    [templateCategory, setTemplateCategory] = useState<Category>(
      "Upper-body strength",
    ),
    [presetError, setPresetError] = useState(""),
    [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const applyPreset = (value: string) => {
    const [source, indexText] = value.split(":"),
      preset = (source === "built" ? workoutPresets : customWorkouts)[
        Number(indexText)
      ];
    if (preset)
      setSession((current) => ({
        ...current,
        title: preset.name,
        category: preset.category,
      }));
  };
  const openPreset = (preset?: WorkoutPreset) => {
    setEditingPreset(preset?.name ?? "");
    setTemplateName(preset?.name ?? "");
    setTemplateCategory(preset?.category ?? "Upper-body strength");
    setPresetError("");
  };
  const savePreset = () => {
    const name = templateName.trim(),
      duplicate = [...workoutPresets, ...customWorkouts].some(
        (item) =>
          item.name.toLowerCase() === name.toLowerCase() &&
          item.name !== editingPreset,
      );
    if (!name) return;
    if (duplicate) {
      setPresetError("A workout with this name already exists.");
      return;
    }
    saveCustom?.(
      { name, category: templateCategory },
      editingPreset || undefined,
    );
    setEditingPreset(null);
    setPresetError("");
  };
  const deletePreset = (name: string) => {
    setPresetToDelete(name);
  };
  if (presetToDelete)
    return (
      <ConfirmDialog
        request={{
          title: "Remove saved workout?",
          message: `Remove ${presetToDelete} from My workouts. Existing scheduled sessions will not be changed.`,
          confirmLabel: "Remove workout",
          destructive: true,
          onConfirm: () => removeCustom?.(presetToDelete),
        }}
        close={() => setPresetToDelete(null)}
      />
    );
  return (
    <div className="workout-library mb-5">
      <div className="workout-library-head">
        <div>
          <p className="eyebrow">WORKOUT LIBRARY</p>
          <b>Start from a reusable workout</b>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => openPreset()}
        >
          <Plus size={14} /> New workout
        </button>
      </div>
      <label className="workout-library-select">
        Choose workout
        <select
          defaultValue=""
          onChange={(event) => {
            applyPreset(event.target.value);
            event.target.value = "";
          }}
        >
          <option value="" disabled>
            Select a workout...
          </option>
          <optgroup label="Built-in workouts">
            {workoutPresets.map((preset, index) => (
              <option key={preset.name} value={`built:${index}`}>
                {preset.name}  -  {preset.category}
              </option>
            ))}
          </optgroup>
          {customWorkouts.length > 0 && (
            <optgroup label="My workouts">
              {customWorkouts.map((preset, index) => (
                <option key={preset.name} value={`custom:${index}`}>
                  {preset.name}  -  {preset.category}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {customWorkouts.length > 0 && (
        <div className="personal-workouts">
          <span>My workouts</span>
          {customWorkouts.map((preset) => (
            <div key={preset.name}>
              <div>
                <b>{preset.name}</b>
                <small>{preset.category}</small>
              </div>
              <button
                type="button"
                onClick={() => openPreset(preset)}
                aria-label={`Edit ${preset.name}`}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => deletePreset(preset.name)}
                aria-label={`Delete ${preset.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {editingPreset !== null && (
        <div className="workout-library-editor">
          <div className="form-grid">
            <label>
              Workout name
              <input
                value={templateName}
                autoFocus
                placeholder="e.g. Push day"
                onChange={(event) => {
                  setTemplateName(event.target.value);
                  setPresetError("");
                }}
              />
            </label>
            <label>
              Workout type
              <select
                value={templateCategory}
                onChange={(event) =>
                  setTemplateCategory(event.target.value as Category)
                }
              >
                <option>Upper-body strength</option>
                <option>Lower-body strength</option>
                <option>Core and accessories</option>
              </select>
            </label>
          </div>
          {presetError && <p className="preset-error">{presetError}</p>}
          <div>
            <button
              type="button"
              className="secondary"
              onClick={() => setEditingPreset(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!templateName.trim()}
              onClick={savePreset}
            >
              {editingPreset ? "Save changes" : "Add workout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}








