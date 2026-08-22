import type { components } from './api.generated';
import type { User } from './user.model';
import type { AgeGroup } from './age-group.model';
import type { Team } from './team.model';

type _Schema = components['schemas']['Player'];

export type PlayerPosition = NonNullable<_Schema['position']>;
export type PreferredFoot = NonNullable<_Schema['preferredFoot']>;
export type PlayerStatus = NonNullable<_Schema['status']>;

export const PLAYER_POSITIONS: { value: PlayerPosition; label: string }[] = [
  { value: 'GK', label: 'Goalkeeper' },
  { value: 'CB', label: 'Centre Back' },
  { value: 'LB', label: 'Left Back' },
  { value: 'RB', label: 'Right Back' },
  { value: 'CM', label: 'Central Midfielder' },
  { value: 'DM', label: 'Defensive Midfielder' },
  { value: 'AM', label: 'Attacking Midfielder' },
  { value: 'LW', label: 'Left Winger' },
  { value: 'RW', label: 'Right Winger' },
  { value: 'ST', label: 'Striker' },
];

export interface Player {
  _id: string;
  name: string;
  dateOfBirth: string;
  city: string;
  address: string;
  phoneNumber: string;
  height?: number;
  weight?: number;
  team?: Team | string | null;
  // اسم فريق حر لما الفريق مش موجود في قايمة الفرق المسجلة — بيتبادل مع team (واحد بس يتحط)
  teamName?: string | null;
  position?: PlayerPosition;
  preferredFoot?: PreferredFoot;
  nationality: string;
  notes?: string;
  profileImg?: string;
  status: PlayerStatus;
  ageGroup: AgeGroup | string;
  // Omitted by the API for observers — they aren't allowed to see the player's coach
  coach?: User | string;
  observers?: (User | string)[];
  createdAt: string;
  updatedAt: string;
}

export interface PlayerFilters {
  page?: number;
  limit?: number;
  sort?: string;
  fields?: string;
  keyword?: string;
  position?: PlayerPosition | '';
  preferredFoot?: PreferredFoot | '';
  ageGroup?: string;
  status?: PlayerStatus | '';
  coach?: string;
  observer?: string;
  team?: string;
  // Stage 4c — admin lens for professional-league players (specs/006-admin-professional-lens).
  // Sent as the string 'true'/'false', matched against server-side query casting.
  isProfessional?: string;
}
