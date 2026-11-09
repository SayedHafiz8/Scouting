import { Injectable, signal } from '@angular/core';
import type { ReportStatistics } from '../models/scouting-report.model';

@Injectable({ providedIn: 'root' })
export class PlayerContextService {
  readonly activePosition = signal<string | null>(null);
  readonly filterPosition = signal<string | null>(null);

  // إحصائيات تقارير اللاعب المفتوح حاليًا — بيحطها PlayerDetailComponent مرة واحدة
  // عند فتح الصفحة، وReportListComponent بيقراها من هنا بدل ما يعمل ريكوست تاني
  // لنفس الـendpoint (كانا بيتنفذوا مع بعض بسبب الـredirectTo على مسار reports)
  readonly reportStatistics = signal<ReportStatistics | null>(null);
  readonly reportStatisticsLoading = signal(false);

  // مستند اللاعب المفتوح حاليًا — نفس فكرة reportStatistics فوق. الأبناء
  // (فورم التقرير) كانوا بيعملوا GET /players/:id تاني لنفس المستند اللي الأب
  // جابه للتو؛ و<router-outlet> بتاع الأب جوه @if (player()) فالابن أصلاً
  // مابيتركّبش قبل ما رد الأب يوصل — يعني الريكوست التاني كان زيادة مؤكدة.
  // مربوط بالـid عشان مستند لاعب قديم مايتقراش للاعب تاني.
  readonly player = signal<{ id: string; document: unknown } | null>(null);

  set(position: string | null): void {
    this.activePosition.set(position);
  }

  clear(): void {
    this.activePosition.set(null);
    this.reportStatistics.set(null);
    this.reportStatisticsLoading.set(false);
    this.player.set(null);
  }

  setPlayer(id: string, document: unknown): void {
    this.player.set({ id, document });
  }

  /** مستند اللاعب ده لو كان متحمّل بالفعل — وإلا null. */
  playerDocument(id: string): unknown | null {
    const cached = this.player();
    return cached && cached.id === id ? cached.document : null;
  }

  setFilter(position: string | null): void {
    this.filterPosition.set(position);
  }

  setReportStatistics(stats: ReportStatistics | null): void {
    this.reportStatistics.set(stats);
  }
}
