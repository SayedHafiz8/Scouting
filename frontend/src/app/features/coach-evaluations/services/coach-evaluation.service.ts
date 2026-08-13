import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { CoachEvaluation, EvaluationSummary, MonthlyPanel } from '../../../core/models/coach-evaluation.model';

type EvalDoc = { document: CoachEvaluation };
type EvalList = { documents: CoachEvaluation[] };

@Injectable({ providedIn: 'root' })
export class CoachEvaluationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/coachEvaluations`;

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

  create(body: Partial<CoachEvaluation>) {
    return this.http.post<ApiResponse<EvalDoc>>(this.base, body);
  }

  update(id: string, body: Partial<CoachEvaluation>) {
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

  summary(coachId?: string) {
    let params = new HttpParams();
    if (coachId) params = params.set('coach', coachId);
    return this.http.get<ApiResponse<EvaluationSummary>>(`${this.base}/summary`, { params });
  }

  monthlyPanel(coachId: string, year: number, month: number) {
    const params = new HttpParams().set('coach', coachId).set('year', year).set('month', month);
    return this.http.get<ApiResponse<MonthlyPanel>>(`${this.base}/monthly`, { params });
  }
}
