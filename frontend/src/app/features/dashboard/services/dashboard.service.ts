import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiResponse } from '../../../core/models/api-response.model';
import { CoachDashboard, AdminDashboard, ObserverDashboard, ProScoutDashboard } from '../../../core/models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/dashboard`;

  readonly liveAdminUpdate$ = new Subject<AdminDashboard>();
  readonly liveCoachUpdate$ = new Subject<CoachDashboard>();

  getCoachDashboard() {
    return this.http.get<ApiResponse<CoachDashboard>>(`${this.base}/coach`);
  }

  getAdminDashboard() {
    return this.http.get<ApiResponse<AdminDashboard>>(`${this.base}/admin`);
  }

  getCoachDashboardByAdmin(coachId: string) {
    return this.http.get<ApiResponse<CoachDashboard>>(`${this.base}/admin/${coachId}`);
  }

  // مرة واحدة بدل ريكويست لكل كوتش — بيرجّع map بالـ id كـ key
  getAllCoachesStats() {
    return this.http.get<ApiResponse<{ stats: Record<string, { totalPlayers: number; selectedPlayers: number }> }>>(
      `${this.base}/admin/coaches-stats`
    );
  }

  getObserverDashboard() {
    return this.http.get<ApiResponse<ObserverDashboard>>(`${this.base}/observer`);
  }

  getObserverDashboardByAdmin(observerId: string) {
    return this.http.get<ApiResponse<ObserverDashboard>>(`${this.base}/admin/observer/${observerId}`);
  }

  getProScoutDashboard() {
    return this.http.get<ApiResponse<ProScoutDashboard>>(`${this.base}/proScout`);
  }
}
