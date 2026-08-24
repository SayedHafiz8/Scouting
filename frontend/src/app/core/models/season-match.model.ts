import type { components } from './api.generated';
import type { AgeGroup } from './age-group.model';
import type { Team } from './team.model';
import type { User } from './user.model';
import type { Player } from './player.model';

// نسخة مختصرة من ScoutingReport — بترجع بس من GET /seasonMatches/:id (تقارير المباراة بعد ما تتلعب)
export interface SeasonMatchReport {
  _id: string;
  player: Player | string;
  coach: User | string;
  overallRating: number;
  matchDate: string;
}

// نسخة مختصرة من PlayerMedia — بترجع بس من GET /seasonMatches/:id (الصور/الفيديوهات المربوطة بالمباراة)
export interface SeasonMatchMedia {
  _id: string;
  player: Player | string;
  uploadedBy: User | string;
  type: 'image' | 'video';
  status?: 'processing' | 'ready' | 'failed';
  url: string | null;
  embedUrl?: string;
  thumbnail?: string;
  download?: string;
  title?: string;
  reviewStatus?: 'pending' | 'approved' | 'rejected' | null;
  createdAt: string;
}

type _Schema = components['schemas']['SeasonMatch'];

export type SeasonMatchStatus = NonNullable<_Schema['status']>;

export const SEASON_MATCH_STATUSES: { value: SeasonMatchStatus; labelKey: string }[] = [
  { value: 'scheduled', labelKey: 'SEASON_MATCHES.STATUS.SCHEDULED' },
  { value: 'completed', labelKey: 'SEASON_MATCHES.STATUS.COMPLETED' },
  { value: 'cancelled', labelKey: 'SEASON_MATCHES.STATUS.CANCELLED' },
  { value: 'postponed', labelKey: 'SEASON_MATCHES.STATUS.POSTPONED' },
];

export type SeasonMatchLeague = 'premier' | 'professional';

export const SEASON_MATCH_LEAGUES: { value: SeasonMatchLeague; labelKey: string }[] = [
  { value: 'premier', labelKey: 'SEASON_MATCHES.LEAGUE_PREMIER' },
  { value: 'professional', labelKey: 'SEASON_MATCHES.LEAGUE_PROFESSIONAL' },
];

export interface SeasonMatchResult {
  homeScore?: number;
  awayScore?: number;
}

export interface SeasonMatch {
  _id: string;
  ageGroup?: AgeGroup | string;
  season: string;
  league: SeasonMatchLeague;
  matchDate: string;
  homeTeam: Team | string;
  awayTeam: Team | string;
  venue?: string;
  status: SeasonMatchStatus;
  result?: SeasonMatchResult;
  attendees?: (User | string)[];
  reports?: SeasonMatchReport[];
  media?: SeasonMatchMedia[];
  createdBy?: User | string;
  updatedBy?: User | string;
  createdAt: string;
  updatedAt: string;
}

// status/result بيتغيروا بس عن طريق SeasonMatchService.updateStatus (الكوتش أو الأوبزيرفر الحاضر، أو الأدمن)
export interface SeasonMatchStatusPayload {
  status: SeasonMatchStatus;
  result?: SeasonMatchResult;
}

export interface SeasonMatchPayload {
  ageGroup?: string;
  season: string;
  league: SeasonMatchLeague;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
}

export interface SeasonMatchFilters {
  ageGroup?: string;
  season?: string;
  league?: SeasonMatchLeague;
  status?: SeasonMatchStatus | '';
  attendees?: string;
  sort?: string;
  'matchDate[gte]'?: string;
  'matchDate[lte]'?: string;
  page?: number;
  limit?: number;
}
