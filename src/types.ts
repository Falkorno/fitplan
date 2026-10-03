export type Category =
  | "Easy run"
  | "Speed work"
  | "Long run"
  | "Upper-body strength"
  | "Lower-body strength"
  | "Core and accessories"
  | "Indoor bike"
  | "Rest"
  | "Walk or mobility";
export type Intensity = "easy" | "moderate" | "hard";
export interface Exercise {
  id: string;
  name: string;
  sets?: number;
  reps?: string;
  weightKg?: number;
  completed?: boolean;
}
export interface ActivityStats {
  elevationGainM?: number;
  averagePowerWatts?: number;
  weightedAveragePowerWatts?: number;
  maxPowerWatts?: number;
  averageHeartRate?: number;
  maxHeartRate?: number;
  averageCadence?: number;
  averageSpeedKph?: number;
  calories?: number;
  kilojoules?: number;
}
export interface Session {
  id: string;
  date: string;
  category: Category;
  title: string;
  plannedDurationMinutes?: number;
  plannedDistanceKm?: number;
  intensity: Intensity;
  completed: boolean;
  skipped: boolean;
  completedAt?: string;
  actualDurationMinutes?: number;
  actualDistanceKm?: number;
  perceivedEffort?: number;
  notes?: string;
  exercises?: Exercise[];
  locked?: boolean;
  stravaActivityId?: string;
  stravaTitle?: string;
  activityTags?: string[];
  activityStats?: ActivityStats;
}
export interface TrainingWeek {
  id: string;
  startDate: string;
  sessions: Session[];
  createdAt: string;
  restDays?: string[];
  restDaySkippedSessionIds?: Record<string, string[]>;
  targets?: TrainingGoals;
  generationExplanation?: string[];
  planningContext?: { wfhDays: number[]; includeLegDay?: boolean };
  archivedAt?: string;
  replacedAt?: string;
}
export interface Habit {
  id: string;
  name: string;
  color: string;
  completedDates: string[];
}
export interface TrainingGoals {
  weeklyRunKm?: number;
  weeklyCycleKm?: number;
  workoutSessions?: number;
  workoutDays?: number[];
  goalType?: "general" | "race" | "distance";
  goalName?: string;
  goalDate?: string;
  goalDistanceKm?: number;
  targetTimeMinutes?: number;
  currentBenchmarkKm?: number;
  currentBenchmarkMinutes?: number;
  experience?: "beginner" | "intermediate" | "advanced";
  progressionPreference?: "gradual" | "steady" | "progressive";
  difficultyPreference?: "comfortable" | "balanced" | "challenging";
}
export interface RecoveryEntry {
  date: string;
  energy: number;
  soreness: number;
  note?: string;
}
export interface HealthAdjustment {
  id: string;
  startDate: string;
  endDate: string;
  reason: "illness" | "soreness" | "fatigue" | "busy";
  mode: "easy" | "shorten" | "pause";
  returnPace: "conservative" | "balanced" | "normal";
  appliedAt?: string;
}
export interface AiReviewCacheEntry {
  review: {
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
  };
  createdAt: string;
}
export interface NotificationPrefs {
  enabled: boolean;
  time: string;
  workout: boolean;
  habits: boolean;
  weeklyReview: boolean;
}
export interface ExternalActivity extends ActivityStats {
  id: string;
  date: string;
  title: string;
  type: "run" | "walk" | "cycle";
  distanceKm: number;
  durationSeconds: number;
  sourceSport?: string;
  workoutType?: number;
  trainer?: boolean;
  commute?: boolean;
  activityTags?: string[];
  stravaUrl: string;
  mapUrl?: string;
  bestEfforts?: Partial<
    Record<"5k" | "10k" | "halfMarathon" | "marathon" | "50k", number>
  >;
}





