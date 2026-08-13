import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { User, CreateUserPayload, IdCardPresence } from '../../../core/models/user.model';
import { QueryBuilderService } from '../../../core/services/query-builder.service';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly qb = inject(QueryBuilderService);
  private readonly base = `${environment.apiUrl}/users`;

  getAll(params: Record<string, unknown> = {}) {
    return this.http.get<PaginatedResponse<{ documents: User[] }>>(this.base, { params: this.qb.build(params) });
  }

  getOne(id: string) {
    return this.http.get<ApiResponse<{ document: User }>>(`${this.base}/${id}`);
  }

  create(payload: CreateUserPayload) {
    return this.http.post<ApiResponse<{ document: User }>>(this.base, payload);
  }

  update(id: string, payload: Partial<User>) {
    return this.http.patch<ApiResponse<{ document: User }>>(`${this.base}/${id}`, payload);
  }

  softDelete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  forceDelete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}/force`);
  }

  restore(id: string) {
    return this.http.patch<ApiResponse<{ document: User }>>(`${this.base}/${id}/restore`, {});
  }

  changePassword(id: string, password: string) {
    return this.http.patch<void>(`${this.base}/${id}/changePassword`, { password });
  }

  getDeactivated() {
    return this.http.get<{ status: string; count: number; data: { documents: User[] } }>(`${this.base}/deactivated`);
  }

  uploadProfileImg(id: string, file: File) {
    const form = new FormData();
    form.append('profileImg', file);
    return this.http.patch<ApiResponse<{ profileImg: string; user: User }>>(`${this.base}/${id}/profileImg`, form);
  }

  uploadIdCardFrontImg(id: string, file: File) {
    const form = new FormData();
    form.append('idCardFrontImg', file);
    return this.http.patch<ApiResponse<{ side: string; uploaded: boolean; user: User }>>(`${this.base}/${id}/idCardImg/front`, form);
  }

  uploadIdCardBackImg(id: string, file: File) {
    const form = new FormData();
    form.append('idCardBackImg', file);
    return this.http.patch<ApiResponse<{ side: string; uploaded: boolean; user: User }>>(`${this.base}/${id}/idCardImg/back`, form);
  }

  // Presence flags only — never a URL. Needs X-Vault-Token (from verifyVaultPassword).
  getIdCardPresence(id: string, vaultToken: string) {
    return this.http.get<ApiResponse<IdCardPresence>>(`${this.base}/${id}/idCardImg`, {
      headers: { 'X-Vault-Token': vaultToken },
    });
  }

  // C3 — stream a side's bytes through the backend (vault zone, no CDN). Returns a Blob
  // the caller turns into an object URL for <img>; the URL is never exposed by the API.
  getIdCardSideBlob(id: string, side: 'front' | 'back', vaultToken: string) {
    return this.http.get(`${this.base}/${id}/idcard/${side}`, {
      headers: { 'X-Vault-Token': vaultToken },
      responseType: 'blob',
    });
  }
}
