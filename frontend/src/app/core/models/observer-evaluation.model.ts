// Mirrors Backend/utils/observerEvaluationCriteria.js — keep in sync (single source of truth server-side).
export const EVALUATION_CRITERIA: Record<string, string[]> = {
  scouting: ['talentIdentification', 'matchAnalysis', 'reportAccuracy'],
  videoWork: ['videoRecordingQuality', 'videoUploadTimeliness', 'videoCoverage'],
  professionalism: ['punctuality', 'commitment', 'attitude'],
  collaboration: ['communication', 'reportTimeliness'],
};

export const EVALUATION_CATEGORIES = Object.keys(EVALUATION_CRITERIA);

export type EvaluationStatus = 'draft' | 'published' | 'archived';

export interface EvaluationStats {
  reportsCount: number;
  matchesAttended: number;
  mediaCount: number;
  playersObserved: number;
  capturedAt?: string;
}

export interface EvaluatorRef {
  _id: string;
  name: string;
}

export interface ObserverRef {
  _id: string;
  name: string;
  email?: string;
}

export interface ObserverEvaluation {
  _id: string;
  observer: ObserverRef;
  evaluator: EvaluatorRef;
  year: number;
  month: number;
  scouting: Record<string, number>;
  videoWork: Record<string, number>;
  professionalism: Record<string, number>;
  collaboration: Record<string, number>;
  overallRating: number;
  status: EvaluationStatus;
  publishedAt?: string | null;
  strengths?: string;
  areasForImprovement?: string;
  notes?: string;
  stats?: EvaluationStats;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvaluationSummary {
  count: number;
  averageOverall: number;
  categoryAverages: Record<string, number>;
  trend: { year: number; month: number; overallRating: number }[];
  latest: ObserverEvaluation | null;
}

// Derived overall band — not stored, computed from overallRating.
export function overallBand(rating: number): { key: string; color: string } {
  if (rating >= 8.5) return { key: 'OBSERVER_EVAL.BAND.EXCELLENT', color: '#22c55e' };
  if (rating >= 7) return { key: 'OBSERVER_EVAL.BAND.GOOD', color: '#10b981' };
  if (rating >= 5) return { key: 'OBSERVER_EVAL.BAND.SATISFACTORY', color: '#f59e0b' };
  return { key: 'OBSERVER_EVAL.BAND.NEEDS_IMPROVEMENT', color: '#f43f5e' };
}

export const MONTH_KEYS = [
  'OBSERVER_EVAL.MONTHS.JAN', 'OBSERVER_EVAL.MONTHS.FEB', 'OBSERVER_EVAL.MONTHS.MAR', 'OBSERVER_EVAL.MONTHS.APR',
  'OBSERVER_EVAL.MONTHS.MAY', 'OBSERVER_EVAL.MONTHS.JUN', 'OBSERVER_EVAL.MONTHS.JUL', 'OBSERVER_EVAL.MONTHS.AUG',
  'OBSERVER_EVAL.MONTHS.SEP', 'OBSERVER_EVAL.MONTHS.OCT', 'OBSERVER_EVAL.MONTHS.NOV', 'OBSERVER_EVAL.MONTHS.DEC',
];
