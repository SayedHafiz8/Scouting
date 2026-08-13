import type { components } from './api.generated';

export type CoachDashboard = Required<components['schemas']['CoachDashboard']>;
export type TopCoach = Required<components['schemas']['TopCoach']>;

// Re-expand AdminDashboard so topCoaches uses the Required TopCoach above
export interface AdminDashboard extends CoachDashboard {
  totalMedia: number;
  totalCoaches: number;
  totalObservers: number;
  totalMatchesPlayed: number;
  topCoaches: TopCoach[];
}

export interface ObserverDashboard {
  totalPlayersObserved: number;
  totalReports: number;
  totalMedia: number;
  totalMatches: number;
}
