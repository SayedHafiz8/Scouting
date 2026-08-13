import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ObserverEvaluationService } from '../services/observer-evaluation.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ObserverEvaluation, EVALUATION_CRITERIA, MONTH_KEYS, overallBand } from '../../../core/models/observer-evaluation.model';

@Component({
  selector: 'app-observer-evaluation-detail',
  standalone: true,
  imports: [RouterLink, TranslatePipe, SkeletonLoaderComponent, ConfirmDialogComponent],
  template: `
    <div class="max-w-3xl mx-auto space-y-5">
      @if (loading()) {
        <app-skeleton-loader type="card" [count]="1" />
      } @else if (evaluation(); as e) {
        <!-- Header -->
        <div class="card p-6 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center gap-4">
            <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black tabular-nums flex-shrink-0"
                 [style.background]="band(e.overallRating).color + '22'" [style.color]="band(e.overallRating).color">
              {{ e.overallRating }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-lg font-bold" style="color:var(--text-primary)">{{ e.observer.name }}</h2>
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold capitalize" [class]="statusClass(e.status)">
                  {{ ('OBSERVER_EVAL.STATUS.' + e.status.toUpperCase()) | translate }}
                </span>
              </div>
              <p class="text-sm mt-0.5" style="color:var(--text-secondary)">{{ band(e.overallRating).key | translate }}</p>
              <p class="text-xs mt-0.5" style="color:var(--text-muted)">
                {{ monthLabel(e.month) | translate }} {{ e.year }} · {{ 'OBSERVER_EVAL.BY' | translate }} {{ e.evaluator.name }}
              </p>
            </div>
          </div>

          @if (isOwn(e)) {
            <div class="flex items-center gap-2 flex-wrap pt-1">
              @if (e.status === 'draft') {
                <a [routerLink]="['/observer-evaluations', e._id, 'edit']" class="btn btn-secondary btn-sm">{{ 'COMMON.EDIT' | translate }}</a>
              }
              @if (e.status !== 'published') {
                <button type="button" class="btn btn-primary btn-sm" (click)="dialog.set('publish')">{{ 'OBSERVER_EVAL.PUBLISH' | translate }}</button>
              }
              @if (e.status === 'published') {
                <button type="button" class="btn btn-secondary btn-sm" (click)="doArchive()">{{ 'OBSERVER_EVAL.ARCHIVE' | translate }}</button>
              }
              <button type="button" class="btn btn-danger btn-sm ms-auto" (click)="dialog.set('delete')">{{ 'COMMON.DELETE' | translate }}</button>
            </div>
          }
        </div>

        <!-- Auto-captured stats -->
        @if (e.stats) {
          <div class="card p-5">
            <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color:var(--text-muted)">{{ 'OBSERVER_EVAL.AUTO_STATS' | translate }}</h3>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              @for (s of statCells(e); track s.key) {
                <div class="rounded-lg px-3 py-2.5" style="background:var(--bg-card-hover)">
                  <p class="text-xs" style="color:var(--text-muted)">{{ s.key | translate }}</p>
                  <p class="text-base font-bold tabular-nums" style="color:var(--text-primary)">{{ s.value }}</p>
                </div>
              }
            </div>
          </div>
        }

        <!-- Criteria breakdown -->
        <div class="card p-5 space-y-6">
          @for (cat of categories; track cat) {
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color:var(--text-muted)">
                {{ ('OBSERVER_EVAL.CATEGORY.' + cat) | translate }}
              </h3>
              <div class="space-y-2.5">
                @for (key of criteria[cat]; track key) {
                  <div class="flex items-center gap-3">
                    <span class="text-sm flex-1" style="color:var(--text-secondary)">{{ ('OBSERVER_EVAL.METRIC.' + key) | translate }}</span>
                    <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:var(--bg-card-hover)">
                      <div class="h-full rounded-full" [style.width.%]="metricValue(e, cat, key) * 10" style="background:var(--accent)"></div>
                    </div>
                    <span class="text-sm font-bold tabular-nums w-6 text-right" style="color:var(--text-primary)">{{ metricValue(e, cat, key) }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Notes -->
        @if (e.strengths || e.areasForImprovement || e.notes) {
          <div class="card p-5 space-y-3">
            @if (e.strengths) {
              <div><p class="form-label">{{ 'OBSERVER_EVAL.STRENGTHS' | translate }}</p><p class="text-sm" style="color:var(--text-secondary)">{{ e.strengths }}</p></div>
            }
            @if (e.areasForImprovement) {
              <div><p class="form-label">{{ 'OBSERVER_EVAL.IMPROVEMENTS' | translate }}</p><p class="text-sm" style="color:var(--text-secondary)">{{ e.areasForImprovement }}</p></div>
            }
            @if (e.notes) {
              <div><p class="form-label">{{ 'OBSERVER_EVAL.NOTES' | translate }}</p><p class="text-sm" style="color:var(--text-secondary)">{{ e.notes }}</p></div>
            }
          </div>
        }
      }
    </div>

    @if (dialog() === 'publish') {
      <app-confirm-dialog
        [title]="'OBSERVER_EVAL.PUBLISH_TITLE' | translate"
        [message]="'OBSERVER_EVAL.PUBLISH_MSG' | translate"
        [confirmLabel]="'OBSERVER_EVAL.PUBLISH' | translate"
        (confirmed)="doPublish()" (cancelled)="dialog.set(null)" />
    }
    @if (dialog() === 'delete') {
      <app-confirm-dialog
        [title]="'OBSERVER_EVAL.DELETE_TITLE' | translate"
        [message]="'OBSERVER_EVAL.DELETE_MSG' | translate"
        [confirmLabel]="'COMMON.DELETE' | translate" [danger]="true"
        (confirmed)="doDelete()" (cancelled)="dialog.set(null)" />
    }
  `,
})
export class ObserverEvaluationDetailComponent implements OnInit {
  private readonly service = inject(ObserverEvaluationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly criteria = EVALUATION_CRITERIA;
  readonly categories = Object.keys(EVALUATION_CRITERIA);

  readonly evaluation = signal<ObserverEvaluation | null>(null);
  readonly loading = signal(true);
  readonly dialog = signal<'publish' | 'delete' | null>(null);

  private id!: string;

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.service.getOne(this.id).subscribe({
      next: (res) => { this.evaluation.set(res.data?.document ?? null); this.loading.set(false); },
      error: () => { this.loading.set(false); this.router.navigate(['/observer-evaluations']); },
    });
  }

  monthLabel(m: number): string { return MONTH_KEYS[m - 1]; }
  band(r: number) { return overallBand(r); }
  metricValue(e: ObserverEvaluation, cat: string, key: string): number { return (e as any)[cat]?.[key] ?? 0; }

  isOwn(e: ObserverEvaluation): boolean {
    return this.auth.isAdmin() && e.evaluator._id === this.auth.currentUser()?._id;
  }

  statusClass(status: string): string {
    if (status === 'published') return 'bg-green-100 text-green-700';
    if (status === 'archived') return 'bg-gray-200 text-gray-600';
    return 'bg-amber-100 text-amber-700';
  }

  statCells(e: ObserverEvaluation) {
    const s = e.stats!;
    return [
      { key: 'OBSERVER_EVAL.STAT.REPORTS', value: s.reportsCount },
      { key: 'OBSERVER_EVAL.STAT.MATCHES', value: s.matchesAttended },
      { key: 'OBSERVER_EVAL.STAT.MEDIA', value: s.mediaCount },
      { key: 'OBSERVER_EVAL.STAT.PLAYERS_OBSERVED', value: s.playersObserved },
    ];
  }

  doPublish(): void {
    this.service.publish(this.id).subscribe(() => {
      this.dialog.set(null);
      this.toast.success(this.translate.instant('OBSERVER_EVAL.PUBLISHED_OK'));
      this.reload();
    });
  }

  doArchive(): void {
    this.service.archive(this.id).subscribe(() => {
      this.toast.success(this.translate.instant('OBSERVER_EVAL.ARCHIVED_OK'));
      this.reload();
    });
  }

  doDelete(): void {
    this.service.remove(this.id).subscribe(() => {
      this.toast.success(this.translate.instant('OBSERVER_EVAL.DELETED_OK'));
      const observerId = this.evaluation()?.observer._id;
      this.router.navigate(['/observer-evaluations'], { queryParams: observerId ? { observer: observerId } : {} });
    });
  }
}
