import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { ObserverEvaluation, EvaluationSummary } from '../../../core/models/observer-evaluation.model';

type EvalDoc = { document: ObserverEvaluation };
type EvalList = { documents: ObserverEvaluation[] };

@Injectable({ providedIn: 'root' })
export class ObserverEvaluationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/observerEvaluations`;

  list(params: Record<string, string | number> = {}) {
    let httpParams = new HttpParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') httpParams = httpParams.set(k, String(v));
    }
    return this.http.get<PaginatedResponse<EvalList>>(this.base, { params: httpParams });
  }

  getOne(id: string) {
    return this.http.get<ApiResponse<EvalDoc>>(`${this.base}/${id}`);
  }

  create(body: Partial<ObserverEvaluation>) {
    return this.http.post<ApiResponse<EvalDoc>>(this.base, body);
  }

  update(id: string, body: Partial<ObserverEvaluation>) {
    return this.http.patch<ApiResponse<EvalDoc>>(`${this.base}/${id}`, body);
  }

  publish(id: string) {
    return this.http.patch<ApiResponse<EvalDoc>>(`${this.base}/${id}/publish`, {});
  }

  archive(id: string) {
    return this.http.patch<ApiResponse<EvalDoc>>(`${this.base}/${id}/archive`, {});
  }

  refreshStats(id: string) {
    return this.http.patch<ApiResponse<EvalDoc>>(`${this.base}/${id}/refresh-stats`, {});
  }

  remove(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  summary(observerId?: string) {
    let params = new HttpParams();
    if (observerId) params = params.set('observer', observerId);
    return this.http.get<ApiResponse<EvaluationSummary>>(`${this.base}/summary`, { params });
  }
}
