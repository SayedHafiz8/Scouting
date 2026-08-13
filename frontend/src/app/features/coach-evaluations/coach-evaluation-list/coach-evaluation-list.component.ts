import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CoachEvaluationService } from '../services/coach-evaluation.service';
import { AuthService } from '../../../core/auth/auth.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { CoachEvaluation, MonthlyPanel, MONTH_KEYS, overallBand } from '../../../core/models/coach-evaluation.model';

@Component({
  selector: 'app-coach-evaluation-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe, SkeletonLoaderComponent],
  template: `
    <div class="max-w-4xl mx-auto space-y-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="page-title">{{ 'COACH_EVAL.TITLE' | translate }}</h2>
          <p class="page-subtitle">{{ 'COACH_EVAL.SUBTITLE' | translate }}</p>
        </div>
        @if (canCreate()) {
          <a [routerLink]="['/coach-evaluations/new']" [queryParams]="{ coach: coachId() }" class="btn btn-primary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            {{ 'COACH_EVAL.NEW' | translate }}
          </a>
        }
      </div>

      @if (loading()) {
        <app-skeleton-loader type="card" [count]="3" />
      } @else if (monthlyTrend().length === 0) {
        <div class="card p-10 flex flex-col items-center text-center gap-3">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center" style="background:var(--bg-card-hover)">
            <svg class="w-7 h-7" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p class="text-sm" style="color:var(--text-muted)">{{ 'COACH_EVAL.EMPTY' | translate }}</p>
        </div>
      } @else {
        <div class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'COACH_EVAL.MONTHLY_TREND' | translate }}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            @for (t of monthlyTrend(); track t.year + '-' + t.month) {
              <button type="button" (click)="openPanelFor(t.coachId, t.year, t.month)"
                      class="card p-5 flex flex-col gap-3 text-start hover:opacity-90 transition-opacity">
                <p class="font-semibold" style="color:var(--text-primary)">{{ monthLabel(t.month) | translate }} {{ t.year }}</p>
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums flex-shrink-0"
                       [style.background]="band(t.average).color + '22'" [style.color]="band(t.average).color">
                    {{ t.average }}
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ band(t.average).key | translate }}</p>
                    <p class="text-xs" style="color:var(--text-muted)">{{ 'COACH_EVAL.ADMINS_COUNT' | translate:{ count: t.count } }}</p>
                  </div>
                </div>
              </button>
            }
          </div>
        </div>
      }
    </div>

    @if (panelOpen()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.5)" (click)="closePanel()">
        <div class="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-bold" style="color:var(--text-primary)">{{ 'COACH_EVAL.MONTHLY_PANEL' | translate }}</h3>
            <button type="button" class="btn btn-secondary btn-sm" (click)="closePanel()">✕</button>
          </div>

          @if (panelLoading()) {
            <app-skeleton-loader type="card" [count]="2" />
          } @else if (panelData(); as p) {
            <div class="flex items-center gap-3 pb-3 border-b" style="border-color:var(--border-color)">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black tabular-nums flex-shrink-0"
                   [style.background]="band(p.averageOverall).color + '22'" [style.color]="band(p.averageOverall).color">
                {{ p.averageOverall }}
              </div>
              <div>
                <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ 'COACH_EVAL.COMBINED_AVERAGE' | translate }}</p>
                <p class="text-xs" style="color:var(--text-muted)">{{ 'COACH_EVAL.ADMINS_COUNT' | translate:{ count: p.count } }}</p>
              </div>
            </div>
            <div class="space-y-2">
              @for (e of p.evaluations; track e._id) {
                <button type="button" (click)="goToEvaluation(e._id)"
                        class="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-start hover:opacity-90 transition-opacity" style="background:var(--bg-card-hover)">
                  <div class="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm tabular-nums flex-shrink-0"
                       [style.background]="band(e.overallRating).color + '22'" [style.color]="band(e.overallRating).color">
                    {{ e.overallRating }}
                  </div>
                  <p class="text-sm font-medium flex-1 min-w-0 truncate" style="color:var(--text-primary)">{{ e.evaluator.name }}</p>
                </button>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class CoachEvaluationListComponent implements OnInit {
  private readonly service = inject(CoachEvaluationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly evaluations = signal<CoachEvaluation[]>([]);
  readonly loading = signal(true);
  readonly coachId = signal<string | null>(null);

  readonly panelOpen = signal(false);
  readonly panelLoading = signal(false);
  readonly panelData = signal<MonthlyPanel | null>(null);

  readonly canCreate = computed(() => this.auth.isAdmin() && !!this.coachId());

  // كارد تريند فوق الصفحة — متوسط تقييمات كل الأدمنز لكل شهر، مبني على نفس الليست
  // اللي أصلا محكومة بقاعدة الـ blind-review (شهر لسه مقفول بيظهر بتقييمي أنا بس)
  readonly monthlyTrend = computed(() => {
    const published = this.evaluations().filter((e) => e.status === 'published');
    const groups = new Map<string, { coachId: string; year: number; month: number; sum: number; count: number }>();
    for (const e of published) {
      const key = `${e.year}-${e.month}`;
      const g = groups.get(key) ?? { coachId: e.coach._id, year: e.year, month: e.month, sum: 0, count: 0 };
      g.sum += e.overallRating;
      g.count += 1;
      groups.set(key, g);
    }
    return [...groups.values()]
      .map((g) => ({ ...g, average: parseFloat((g.sum / g.count).toFixed(2)) }))
      .sort((a, b) => b.year - a.year || b.month - a.month);
  });

  ngOnInit(): void {
    this.coachId.set(this.route.snapshot.queryParamMap.get('coach'));
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.auth.isAdmin() && this.coachId()) params['coach'] = this.coachId()!;
    this.service.list(params).subscribe({
      next: (res) => {
        this.evaluations.set(res.data?.documents ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  monthLabel(m: number): string { return MONTH_KEYS[m - 1]; }
  band(r: number) { return overallBand(r); }

  openPanelFor(coachId: string, year: number, month: number): void {
    this.panelOpen.set(true);
    this.panelLoading.set(true);
    this.panelData.set(null);
    this.service.monthlyPanel(coachId, year, month).subscribe({
      next: (res) => {
        this.panelData.set(res.data ?? null);
        this.panelLoading.set(false);
      },
      error: () => {
        this.panelLoading.set(false);
        this.closePanel();
      },
    });
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.panelData.set(null);
  }

  goToEvaluation(id: string): void {
    this.closePanel();
    this.router.navigate(['/coach-evaluations', id]);
  }
}
