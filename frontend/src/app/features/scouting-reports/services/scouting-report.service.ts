import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { ScoutingReport, ReportStatistics } from '../../../core/models/scouting-report.model';
import { QueryBuilderService } from '../../../core/services/query-builder.service';

@Injectable({ providedIn: 'root' })
export class ScoutingReportService {
  private readonly http = inject(HttpClient);
  private readonly qb = inject(QueryBuilderService);

  private base(playerId: string): string {
    return `${environment.apiUrl}/players/${playerId}/reports`;
  }

  getAll(playerId: string, params: Record<string, unknown> = {}) {
    return this.http.get<PaginatedResponse<{ documents: ScoutingReport[] }>>(
      this.base(playerId), { params: this.qb.build(params) }
    );
  }

  getStatistics(playerId: string) {
    return this.http.get<ApiResponse<{ statistics: ReportStatistics }>>(`${this.base(playerId)}/statistics`);
  }

  // متوسط overallRating لكل لاعب دفعة واحدة — لكروت قايمة اللاعبين
  getAverageRatings(playerIds: string[]) {
    return this.http.get<ApiResponse<{ averages: Record<string, { overallRating: number; totalReports: number }> }>>(
      `${environment.apiUrl}/players/reports/average-ratings`,
      { params: playerIds.length ? { ids: playerIds.join(',') } : {} }
    );
  }

  getOne(playerId: string, reportId: string) {
    return this.http.get<ApiResponse<{ document: ScoutingReport }>>(`${this.base(playerId)}/${reportId}`);
  }

  create(playerId: string, payload: Partial<ScoutingReport>) {
    return this.http.post<ApiResponse<{ document: ScoutingReport }>>(this.base(playerId), payload);
  }

  update(playerId: string, reportId: string, payload: Partial<ScoutingReport>) {
    return this.http.patch<ApiResponse<{ document: ScoutingReport }>>(`${this.base(playerId)}/${reportId}`, payload);
  }

  delete(playerId: string, reportId: string) {
    return this.http.delete<void>(`${this.base(playerId)}/${reportId}`);
  }
}
