import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { Team } from '../../../core/models/team.model';
import { SeasonMatchLeague } from '../../../core/models/season-match.model';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/teams`;

  getAll(ageGroup?: string, league?: SeasonMatchLeague) {
    const params: Record<string, string> = {};
    if (ageGroup) params['ageGroup'] = ageGroup;
    if (league) params['league'] = league;
    return this.http.get<PaginatedResponse<{ documents: Team[] }>>(this.base, { params });
  }

  getOne(id: string) {
    return this.http.get<ApiResponse<{ document: Team }>>(`${this.base}/${id}`);
  }

  create(payload: { name: string; clubName: string; ageGroup: string; league: SeasonMatchLeague }) {
    return this.http.post<ApiResponse<{ document: Team }>>(this.base, payload);
  }

  delete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
