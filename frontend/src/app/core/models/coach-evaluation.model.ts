// Mirrors Backend/utils/coachEvaluationCriteria.js — keep in sync (single source of truth server-side).
export const EVALUATION_CRITERIA: Record<string, string[]> = {
  scouting: ['talentIdentification', 'matchAnalysis', 'reportAccuracy'],
  videoWork: ['videoRecordingQuality', 'videoUploadTimeliness', 'videoCoverage'],
  rosterManagement: ['playerProfileQuality', 'squadOrganization'],
  professionalism: ['punctuality', 'commitment', 'matchAttendance'],
};

export const EVALUATION_CATEGORIES = Object.keys(EVALUATION_CRITERIA);

export type EvaluationStatus = 'draft' | 'published' | 'archived';

export interface EvaluationStats {
  reportsCount: number;
  matchesAttended: number;
  mediaCount: number;
  playersManaged: number;
  capturedAt?: string;
}

export interface EvaluatorRef {
  _id: string;
  name: string;
}

export interface CoachRef {
  _id: string;
  name: string;
  email?: string;
}

export interface CoachEvaluation {
  _id: string;
  coach: CoachRef;
  evaluator: EvaluatorRef;
  year: number;
  month: number;
  scouting: Record<string, number>;
  videoWork: Record<string, number>;
  rosterManagement: Record<string, number>;
  professionalism: Record<string, number>;
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

export interface MonthlyPanel {
  count: number;
  averageOverall: number;
  evaluations: CoachEvaluation[];
}

export interface EvaluationSummary {
  count: number;
  averageOverall: number;
  categoryAverages: Record<string, number>;
  trend: { year: number; month: number; overallRating: number }[];
  latest: CoachEvaluation | null;
}

// Derived overall band — not stored, computed from overallRating.
export function overallBand(rating: number): { key: string; color: string } {
  if (rating >= 8.5) return { key: 'COACH_EVAL.BAND.EXCELLENT', color: '#22c55e' };
  if (rating >= 7) return { key: 'COACH_EVAL.BAND.GOOD', color: '#10b981' };
  if (rating >= 5) return { key: 'COACH_EVAL.BAND.SATISFACTORY', color: '#f59e0b' };
  return { key: 'COACH_EVAL.BAND.NEEDS_IMPROVEMENT', color: '#f43f5e' };
}

export const MONTH_KEYS = [
  'COACH_EVAL.MONTHS.JAN', 'COACH_EVAL.MONTHS.FEB', 'COACH_EVAL.MONTHS.MAR', 'COACH_EVAL.MONTHS.APR',
  'COACH_EVAL.MONTHS.MAY', 'COACH_EVAL.MONTHS.JUN', 'COACH_EVAL.MONTHS.JUL', 'COACH_EVAL.MONTHS.AUG',
  'COACH_EVAL.MONTHS.SEP', 'COACH_EVAL.MONTHS.OCT', 'COACH_EVAL.MONTHS.NOV', 'COACH_EVAL.MONTHS.DEC',
];
