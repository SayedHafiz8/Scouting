import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../services/dashboard.service';
import { SocketService } from '../../../core/services/socket.service';
import { UserService } from '../../users/services/user.service';
import { ObserverDashboard } from '../../../core/models/dashboard.model';
import { User } from '../../../core/models/user.model';
import { StatCardComponent } from '../components/stat-card/stat-card.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { ObserverEvaluationService } from '../../observer-evaluations/services/observer-evaluation.service';
import { ObserverEvaluation, MONTH_KEYS, overallBand } from '../../../core/models/observer-evaluation.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-observer-dashboard',
    imports: [StatCardComponent, SkeletonLoaderComponent, RouterLink, TranslatePipe],
    template: `
    <div class="max-w-5xl mx-auto space-y-6">

      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="page-title">
            @if (observerId() && observer()) {
              {{ observer()!.name }}
            } @else {
              {{ 'DASHBOARD.OBSERVER_TITLE' | translate }}
            }
          </h2>
          <p class="page-subtitle">
            {{ observerId() ? (observer()?.email ?? ('DASHBOARD.VIEWING_OBSERVER' | translate)) : ('DASHBOARD.OBSERVER_SUBTITLE' | translate) }}
          </p>
        </div>
        <a [routerLink]="['/players']" [queryParams]="observerId() ? {observer: observerId()!} : {}" class="btn btn-primary btn-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          {{ 'DASHBOARD.VIEW_PLAYERS' | translate }}
        </a>
      </div>

      @if (loading()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <app-skeleton-loader type="stat" [count]="4" />
        </div>
      } @else if (data()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <app-stat-card
            [label]="'DASHBOARD.PLAYERS_OBSERVED' | translate"
            [value]="data()!.totalPlayersObserved"
            iconBg="rgba(99,102,241,0.18)"
            iconColor="#818cf8"
            iconName="players"
            [link]="'/players'"
            [queryParams]="observerId() ? {observer: observerId()!} : {}"
          />
          <app-stat-card
            [label]="'DASHBOARD.TOTAL_MATCHES' | translate"
            [value]="data()!.totalMatches"
            iconBg="rgba(14,165,233,0.18)"
            iconColor="#0ea5e9"
            iconName="matches"
            link="/my-matches"
            [queryParams]="observerId() ? {observer: observerId()!} : {}"
          />
          <app-stat-card
            [label]="'DASHBOARD.TOTAL_REPORTS' | translate"
            [value]="data()!.totalReports"
            iconBg="rgba(168,85,247,0.18)"
            iconColor="#a855f7"
            iconName="reports"
          />
          <app-stat-card
            [label]="'DASHBOARD.MEDIA' | translate"
            [value]="data()!.totalMedia"
            iconBg="rgba(34,197,94,0.18)"
            iconColor="#22c55e"
            iconName="media"
          />
        </div>
      }

      <!-- Latest monthly evaluation from admin -->
      @if (latestEval(); as e) {
        <a [routerLink]="['/observer-evaluations']" [queryParams]="observerId() ? {observer: observerId()!} : {}"
           class="card p-5 flex items-center gap-4 transition-colors hover:bg-[var(--bg-card-hover)]">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black tabular-nums flex-shrink-0"
               [style.background]="band(e.overallRating).color + '22'" [style.color]="band(e.overallRating).color">
            {{ e.overallRating }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold uppercase tracking-widest" style="color:var(--text-muted)">{{ 'OBSERVER_EVAL.LATEST' | translate }}</p>
            <p class="text-sm font-semibold mt-0.5" style="color:var(--text-primary)">{{ band(e.overallRating).key | translate }}</p>
            <p class="text-xs" style="color:var(--text-muted)">{{ monthLabel(e.month) | translate }} {{ e.year }}</p>
          </div>
          <svg class="w-5 h-5 flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </a>
      }
    </div>
  `
})
export class ObserverDashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly socketService = inject(SocketService);
  private readonly userService = inject(UserService);
  private readonly route = inject(ActivatedRoute);
  private readonly evalService = inject(ObserverEvaluationService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly data = signal<ObserverDashboard | null>(null);
  readonly loading = signal(true);
  readonly observer = signal<User | null>(null);
  readonly observerId = signal<string | null>(null);
  readonly latestEval = signal<ObserverEvaluation | null>(null);

  constructor() {
    this.socketService.getObserverUpdates()
      .pipe(takeUntilDestroyed())
      .subscribe(update => this.data.set(update));

    // تقييم شهري جديد اتنشر من الأدمن — نحدّث الكارت ونبلّغ الكشاف لايف (بس لو ده الداشبورد بتاعه هو)
    this.socketService.getObserverEvaluationUpdates()
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.observerId()) return; // الأدمن بيشوف داشبورد كشاف تاني — مش لازم يتبلغ
        this.toast.info(this.translate.instant('OBSERVER_EVAL.NEW_PUBLISHED_TOAST'));
        this.loadLatestEvaluation();
      });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('observerId');
    this.observerId.set(id);

    if (id) {
      this.userService.getOne(id).subscribe({
        next: res => this.observer.set((res.data as any)?.document ?? null),
      });
    }

    const req$ = id
      ? this.dashboardService.getObserverDashboardByAdmin(id)
      : this.dashboardService.getObserverDashboard();

    req$.subscribe({
      next: res => {
        if (res.data) this.data.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.loadLatestEvaluation();
  }

  private loadLatestEvaluation(): void {
    this.evalService.summary(this.observerId() ?? undefined).subscribe({
      next: res => this.latestEval.set(res.data?.latest ?? null),
      error: () => {},
    });
  }

  monthLabel(m: number): string { return MONTH_KEYS[m - 1]; }
  band(r: number) { return overallBand(r); }
}
