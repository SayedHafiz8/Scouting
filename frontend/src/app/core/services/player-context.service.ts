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

  set(position: string | null): void {
    this.activePosition.set(position);
  }

  clear(): void {
    this.activePosition.set(null);
    this.reportStatistics.set(null);
    this.reportStatisticsLoading.set(false);
  }

  setFilter(position: string | null): void {
    this.filterPosition.set(position);
  }

  setReportStatistics(stats: ReportStatistics | null): void {
    this.reportStatistics.set(stats);
  }
}
