import type { components } from './api.generated';
import type { Player } from './player.model';
import type { User } from './user.model';
import type { Team } from './team.model';
import type { SeasonMatch } from './season-match.model';
import type { AgeGroup } from './age-group.model';

type _Schema = components['schemas']['ScoutingReport'];

// طلب مالك 2026-11-18 — 10 مجموعات بدل technical/physical/mental، و2026-11-25
// — 31 بند والسلّم 1→10. التعريف المرجعي: features/scouting-reports/report-metrics.ts
// (وعلى السيرفر Backend/constants/reportMetrics.js). الأنواع دي مولّدة من
// openapi.json فمستحيل تفرق عن السيرفر.
export type DecisionMakingRatings = Required<components['schemas']['DecisionMakingRatings']>;
export type SelfMotivationRatings = Required<components['schemas']['SelfMotivationRatings']>;
export type TechnicalSkillsRatings = Required<components['schemas']['TechnicalSkillsRatings']>;
export type PhysicalAbilitiesRatings = Required<components['schemas']['PhysicalAbilitiesRatings']>;
export type PersonalityRatings = Required<components['schemas']['PersonalityRatings']>;
export type SpecialDefendingRatings = Required<components['schemas']['SpecialDefendingRatings']>;
export type SpecialAttackingRatings = Required<components['schemas']['SpecialAttackingRatings']>;
export type WorkEthicRatings = Required<components['schemas']['WorkEthicRatings']>;
export type OnFieldLeadershipRatings = Required<components['schemas']['OnFieldLeadershipRatings']>;
export type WinningMentalityRatings = Required<components['schemas']['WinningMentalityRatings']>;
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
  // الفئة العمرية اللي اللاعب لعب معاها لما التقرير مش مربوط بمباراة من الجدول —
  // ممكن تكون غير فئته هو (لاعب بيلعب مع فئة أكبر)
  playedWithAgeGroup?: AgeGroup | string | null;
  // ⚠️ التقارير اللي اتكتبت قبل 2026-11-18 مالهاش المجموعات دي خالص (استبدال
  // بلا migration بقرار المالك)، فبترجع من السيرفر غايبة — عشان كده كلها
  // اختيارية هنا. العرض بيتعامل مع الغايب كصفر/"—" بدل ما يكراش.
  decisionMaking?: DecisionMakingRatings;
  selfMotivation?: SelfMotivationRatings;
  technicalSkills?: TechnicalSkillsRatings;
  physicalAbilities?: PhysicalAbilitiesRatings;
  personality?: PersonalityRatings;
  specialDefending?: SpecialDefendingRatings;
  specialAttacking?: SpecialAttackingRatings;
  workEthic?: WorkEthicRatings;
  onFieldLeadership?: OnFieldLeadershipRatings;
  winningMentality?: WinningMentalityRatings;
  /** متوسط الـ31 بند، 1→10. تقارير أسبوع 2026-11-18→25 قيمتها على سلّم 1→5. */
  overallRating: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

