import { Component, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardService } from '../services/dashboard.service';
import { SocketService } from '../../../core/services/socket.service';
import { CoachDashboard } from '../../../core/models/dashboard.model';
import { StatCardComponent } from '../components/stat-card/stat-card.component';
import { SelectionRateGaugeComponent } from '../components/selection-rate-gauge/selection-rate-gauge.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CoachEvaluationService } from '../../coach-evaluations/services/coach-evaluation.service';
import { CoachEvaluation, MONTH_KEYS, overallBand } from '../../../core/models/coach-evaluation.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-coach-dashboard',
    imports: [StatCardComponent, SelectionRateGaugeComponent, SkeletonLoaderComponent, RouterLink, TranslatePipe],
    template: `
    <div class="max-w-5xl mx-auto space-y-6">

      <!-- Page header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="page-title">{{ 'DASHBOARD.COACH_TITLE' | translate }}</h2>
          <p class="page-subtitle">{{ 'DASHBOARD.COACH_SUBTITLE' | translate }}</p>
        </div>
        <a routerLink="/players/new" class="btn btn-primary btn-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ 'DASHBOARD.ADD_PLAYER' | translate }}
        </a>
      </div>

      @if (loading()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <app-skeleton-loader type="stat" [count]="4" />
        </div>
      } @else if (data()) {
        <!-- Stat cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <app-stat-card
            [label]="'DASHBOARD.TOTAL_PLAYERS' | translate"
            [value]="data()!.totalPlayers"
            iconBg="rgba(34,197,94,0.18)"
            iconColor="#22c55e"
            iconName="players"
            link="/players"
          />
          <app-stat-card
            [label]="'DASHBOARD.SELECTED' | translate"
            [value]="data()!.selectedPlayers"
            iconBg="rgba(16,185,129,0.18)"
            iconColor="#10b981"
            iconName="selected"
            link="/players"
            [queryParams]="{status: 'selected'}"
          />
          <app-stat-card
            [label]="'DASHBOARD.PENDING' | translate"
            [value]="data()!.pendingPlayers"
            iconBg="rgba(245,158,11,0.18)"
            iconColor="#f59e0b"
            iconName="pending"
            link="/players"
            [queryParams]="{status: 'pending'}"
          />
          <app-stat-card
            [label]="'DASHBOARD.REJECTED' | translate"
            [value]="data()!.rejectedPlayers"
            iconBg="rgba(244,63,94,0.18)"
            iconColor="#f43f5e"
            iconName="rejected"
            link="/players"
            [queryParams]="{status: 'rejected'}"
          />
        </div>

        <!-- Secondary row -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <app-stat-card
            [label]="'DASHBOARD.TOTAL_REPORTS' | translate"
            [value]="data()!.totalReports"
            iconBg="rgba(99,102,241,0.18)"
            iconColor="#818cf8"
            iconName="reports"
          />
          <app-stat-card
            [label]="'DASHBOARD.MATCHES_ATTENDED' | translate"
            [value]="data()!.matchesAttended"
            iconBg="rgba(14,165,233,0.18)"
            iconColor="#0ea5e9"
            iconName="matches"
            link="/my-matches"
          />
          <app-selection-rate-gauge [rate]="selectionRate()" class="sm:col-span-2" />
        </div>
      }

      <!-- Latest monthly evaluation from admin -->
      @if (latestEval(); as e) {
        <a [routerLink]="['/coach-evaluations']"
           class="card p-5 flex items-center gap-4 transition-colors hover:bg-[var(--bg-card-hover)]">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black tabular-nums flex-shrink-0"
               [style.background]="band(e.overallRating).color + '22'" [style.color]="band(e.overallRating).color">
            {{ e.overallRating }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold uppercase tracking-widest" style="color:var(--text-muted)">{{ 'COACH_EVAL.LATEST' | translate }}</p>
            <p class="text-sm font-semibold mt-0.5" style="color:var(--text-primary)">{{ band(e.overallRating).key | translate }}</p>
            <p class="text-xs" style="color:var(--text-muted)">{{ monthLabel(e.month) | translate }} {{ e.year }}</p>
          </div>
          <svg class="w-5 h-5 flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
      }
    </div>
  `
})
export class CoachDashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly socketService = inject(SocketService);
  private readonly evalService = inject(CoachEvaluationService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly data = signal<CoachDashboard | null>(null);
  readonly loading = signal(true);
  readonly latestEval = signal<CoachEvaluation | null>(null);

  constructor() {
    this.socketService.getCoachUpdates()
      .pipe(takeUntilDestroyed())
      .subscribe(update => this.data.set(update));

    // تقييم شهري جديد اتنشر من الأدمن — نحدّث الكارت ونبلّغ الكشاف لايف
    this.socketService.getCoachEvaluationUpdates()
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.toast.info(this.translate.instant('COACH_EVAL.NEW_PUBLISHED_TOAST'));
        this.loadLatestEvaluation();
      });
  }

  ngOnInit(): void {
    this.dashboardService.getCoachDashboard().subscribe({
      next: res => {
        if (res.data) this.data.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.loadLatestEvaluation();
  }

  private loadLatestEvaluation(): void {
    this.evalService.summary().subscribe({
      next: res => this.latestEval.set(res.data?.latest ?? null),
      error: () => {},
    });
  }

  selectionRate(): number {
    const d = this.data();
    if (!d || !d.totalPlayers) return 0;
    return Math.round((d.selectedPlayers / d.totalPlayers) * 100);
  }

  monthLabel(m: number): string { return MONTH_KEYS[m - 1]; }
  band(r: number) { return overallBand(r); }
}
