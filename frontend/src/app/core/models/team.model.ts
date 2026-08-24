import { AgeGroup } from './age-group.model';
import type { SeasonMatchLeague } from './season-match.model';

export interface Team {
  _id: string;
  name: string;
  ageGroup?: AgeGroup | string;
  league: SeasonMatchLeague;
  clubName: string;
  active: boolean;
}
