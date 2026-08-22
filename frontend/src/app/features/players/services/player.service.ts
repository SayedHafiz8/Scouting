import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { Player, PlayerFilters, PlayerStatus } from '../../../core/models/player.model';
import { QueryBuilderService } from '../../../core/services/query-builder.service';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly http = inject(HttpClient);
  private readonly qb = inject(QueryBuilderService);
  private readonly base = `${environment.apiUrl}/players`;

  getAll(filters: PlayerFilters = {}) {
    return this.http.get<PaginatedResponse<{ documents: Player[] }>>(
      this.base, { params: this.qb.build(filters as Record<string, unknown>) }
    );
  }

  getOne(id: string) {
    return this.http.get<ApiResponse<{ document: Player }>>(`${this.base}/${id}`);
  }

  countsByAgeGroup(status?: PlayerStatus | '', coach?: string, observer?: string) {
    const params: Record<string, string> = {};
    if (status) params['status'] = status;
    if (coach) params['coach'] = coach;
    if (observer) params['observer'] = observer;
    return this.http.get<ApiResponse<{ counts: Record<string, number>; total: number; professional: number }>>(
      `${this.base}/counts`, { params }
    );
  }

  create(payload: Partial<Player>) {
    return this.http.post<ApiResponse<{ document: Player }>>(this.base, payload);
  }

  update(id: string, payload: Partial<Player>) {
    return this.http.patch<ApiResponse<{ document: Player }>>(`${this.base}/${id}`, payload);
  }

  delete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  updateStatus(id: string, status: PlayerStatus, observers?: string[]) {
    const body: { status: PlayerStatus; observers?: string[] } = { status };
    if (status === 'observed' && observers?.length) body.observers = observers;
    return this.http.patch<ApiResponse<{ document: Player }>>(`${this.base}/${id}/status`, body);
  }

  // Add/remove observers without touching the player's status — lets the admin
  // revoke a single observer's access while keeping the rest assigned.
  updateObservers(id: string, observers: string[]) {
    return this.http.patch<ApiResponse<{ document: Player }>>(`${this.base}/${id}/observers`, { observers });
  }

  // Hand a player to a coach. Admin-only server-side, and the only way to give an
  // owner back to a player whose coach account was permanently deleted — the API
  // clears `coach` on those instead of cascading the deletion onto the player.
  assignCoach(id: string, coach: string) {
    return this.http.patch<ApiResponse<{ document: Player }>>(`${this.base}/${id}/coach`, { coach });
  }

  uploadProfileImg(id: string, file: File) {
    const form = new FormData();
    form.append('profileImg', file);
    return this.http.patch<ApiResponse<{ profileImg: string; player: Player }>>(`${this.base}/${id}/profileImg`, form);
  }
}
