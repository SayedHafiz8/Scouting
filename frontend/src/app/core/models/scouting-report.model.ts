import type { components } from './api.generated';
import type { Player } from './player.model';
import type { User } from './user.model';
import type { Team } from './team.model';
import type { SeasonMatch } from './season-match.model';

type _Schema = components['schemas']['ScoutingReport'];

export type TechnicalSkills = Required<components['schemas']['TechnicalSkills']>;
export type PhysicalSkills = Required<components['schemas']['PhysicalSkills']>;
export type MentalSkills = Required<components['schemas']['MentalSkills']>;
export type ReportStatistics = Required<components['schemas']['ReportStatistics']>;

export type ReportMatchType = 'official' | 'friendly' | 'training';

export interface ScoutingReport {
  _id: string;
  player: Player | string;
  coach: User | string;
  matchDate: string;
  matchType?: ReportMatchType;
  homeTeam?: Team | string | null;
  homeTeamName?: string | null;
  awayTeam?: Team | string | null;
  awayTeamName?: string | null;
  seasonMatch?: SeasonMatch | string | null;
  technical: TechnicalSkills;
  physical: PhysicalSkills;
  mental: MentalSkills;
  overallRating: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportFormValue {
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  passing: number | null;
  dribbling: number | null;
  shooting: number | null;
  ballControl: number | null;
  speed: number | null;
  stamina: number | null;
  strength: number | null;
  agility: number | null;
  positioning: number | null;
  decisionMaking: number | null;
  teamwork: number | null;
  attitude: number | null;
  notes: string;
}
