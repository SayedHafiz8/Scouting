import { PlayerPosition } from './player.model';
import { PlayerStatus } from './player.model';
import { CoachDashboard, AdminDashboard, ObserverDashboard } from './dashboard.model';

export interface DailySummaryPlayer {
  name: string;
  position: PlayerPosition;
}

export interface DailySummaryDetail {
  coach: string;
  count: number;
  players: DailySummaryPlayer[];
}

export interface ObserverEvaluationPublished {
  evaluationId: string;
  overallRating: number;
  year: number;
  month: number;
}

export interface CoachEvaluationPublished {
  evaluationId: string;
  overallRating: number;
  year: number;
  month: number;
}

export type MediaRejectionReasonCode =
  | 'unclear_footage'
  | 'scout_name_missing'
  | 'match_date_missing'
  | 'teams_not_specified';

export interface SocketNotification {
  type: 'DAILY_SUMMARY' | 'ADMIN_DASHBOARD_UPDATE' | 'COACH_DASHBOARD_UPDATE' | 'OBSERVER_DASHBOARD_UPDATE' | 'PLAYER_STATUS_UPDATED' | 'PLAYER_ASSIGNED_TO_OBSERVER' | 'OBSERVER_EVALUATION_PUBLISHED' | 'COACH_EVALUATION_PUBLISHED' | 'MEDIA_REJECTED';
  message?: string;
  details?: DailySummaryDetail[];
  data?: CoachDashboard | AdminDashboard | ObserverDashboard | ObserverEvaluationPublished | CoachEvaluationPublished;
  playerId?: string;
  playerName?: string;
  mediaId?: string;
  reasonCodes?: MediaRejectionReasonCode[];
  status?: PlayerStatus;
  createdAt?: string;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration: number;
}
