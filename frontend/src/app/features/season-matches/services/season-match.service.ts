import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { SeasonMatch, SeasonMatchFilters, SeasonMatchPayload, SeasonMatchStatusPayload } from '../../../core/models/season-match.model';
import { QueryBuilderService } from '../../../core/services/query-builder.service';

@Injectable({ providedIn: 'root' })
export class SeasonMatchService {
  private readonly http = inject(HttpClient);
  private readonly qb = inject(QueryBuilderService);
  private readonly base = `${environment.apiUrl}/seasonMatches`;

  getAll(filters: SeasonMatchFilters = {}) {
    return this.http.get<PaginatedResponse<{ documents: SeasonMatch[] }>>(
      this.base, { params: this.qb.build(filters as Record<string, unknown>) }
    );
  }

  getOne(id: string) {
    return this.http.get<ApiResponse<{ document: SeasonMatch }>>(`${this.base}/${id}`);
  }

  create(payload: SeasonMatchPayload) {
    return this.http.post<ApiResponse<{ document: SeasonMatch }>>(this.base, payload);
  }

  update(id: string, payload: Partial<SeasonMatchPayload>) {
    return this.http.patch<ApiResponse<{ document: SeasonMatch }>>(`${this.base}/${id}`, payload);
  }

  delete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  updateStatus(id: string, payload: SeasonMatchStatusPayload) {
    return this.http.patch<ApiResponse<{ document: SeasonMatch }>>(`${this.base}/${id}/status`, payload);
  }

  // الكشاف يسجّل حضوره بنفسه
  attend(id: string) {
    return this.http.post<ApiResponse<{ document: SeasonMatch }>>(`${this.base}/${id}/attend`, {});
  }

  unattend(id: string) {
    return this.http.delete<ApiResponse<{ document: SeasonMatch }>>(`${this.base}/${id}/attend`);
  }
}
