import type { components } from './api.generated';

export type CoachDashboard = Required<components['schemas']['CoachDashboard']>;
export type TopCoach = Required<components['schemas']['TopCoach']>;

// Re-expand AdminDashboard so topCoaches uses the Required TopCoach above
export interface AdminDashboard extends CoachDashboard {
  observedPlayers: number;
  totalMedia: number;
  totalCoaches: number;
  totalObservers: number;
  totalProScouts: number;
  totalMatchesPlayed: number;
  topCoaches: TopCoach[];
}

export interface ObserverDashboard {
  totalPlayersObserved: number;
  // players this observer is the scout of, split by status (observed folds into pending)
  totalPlayers: number;
  selectedPlayers: number;
  pendingPlayers: number;
  rejectedPlayers: number;
  selectionRate: number | string;
  // players the observer follows but isn't the scout of
  followedPlayers: number;
  totalReports: number;
  totalMedia: number;
  totalMatches: number;
}

export type ProScoutMatchTeamRef = Required<components['schemas']['ProScoutMatchTeamRef']>;
export type ProScoutMatchResult = components['schemas']['ProScoutMatchResult'];

export interface ProScoutMatch {
  _id: string;
  matchDate: string;
  homeTeam: ProScoutMatchTeamRef;
  awayTeam: ProScoutMatchTeamRef;
  venue: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'postponed';
  result: ProScoutMatchResult | null;
}

export type ProScoutReportPlayerRef = Required<components['schemas']['ProScoutReportPlayerRef']>;

export interface ProScoutReport {
  _id: string;
  player: ProScoutReportPlayerRef;
  matchDate: string;
  overallRating: number;
}

// Re-expand so the two list element types above are used, rather than the
// shallow-Required generated shape (Required<> does not recurse into nested
// array element types).
export interface ProScoutDashboard {
  totalPlayers: number;
  selectedPlayers: number;
  pendingPlayers: number;
  rejectedPlayers: number;
  upcomingMatchesCount: number;
  totalReports: number;
  upcomingMatches: ProScoutMatch[];
  latestResults: ProScoutMatch[];
  recentReports: ProScoutReport[];
}
