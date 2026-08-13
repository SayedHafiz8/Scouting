import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ObserverEvaluationService } from '../services/observer-evaluation.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ObserverEvaluation, MONTH_KEYS, overallBand } from '../../../core/models/observer-evaluation.model';

@Component({
  selector: 'app-observer-evaluation-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe, SkeletonLoaderComponent, ConfirmDialogComponent],
  template: `
    <div class="max-w-4xl mx-auto space-y-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="page-title">{{ 'OBSERVER_EVAL.TITLE' | translate }}</h2>
          <p class="page-subtitle">{{ 'OBSERVER_EVAL.SUBTITLE' | translate }}</p>
        </div>
        @if (canCreate()) {
          <a [routerLink]="['/observer-evaluations/new']" [queryParams]="{ observer: observerId() }" class="btn btn-primary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            {{ 'OBSERVER_EVAL.NEW' | translate }}
          </a>
        }
      </div>

      @if (loading()) {
        <app-skeleton-loader type="card" [count]="3" />
      } @else if (evaluations().length === 0) {
        <div class="card p-10 flex flex-col items-center text-center gap-3">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center" style="background:var(--bg-card-hover)">
            <svg class="w-7 h-7" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p class="text-sm" style="color:var(--text-muted)">{{ 'OBSERVER_EVAL.EMPTY' | translate }}</p>
        </div>
      } @else {
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          @for (e of evaluations(); track e._id) {
            <div class="card p-5 flex flex-col gap-3">
              <div class="flex items-start justify-between gap-2">
                <a [routerLink]="['/observer-evaluations', e._id]" class="min-w-0">
                  <p class="font-semibold" style="color:var(--text-primary)">{{ monthLabel(e.month) | translate }} {{ e.year }}</p>
                  <p class="text-xs mt-0.5 truncate" style="color:var(--text-muted)">
                    {{ 'OBSERVER_EVAL.BY' | translate }} {{ e.evaluator.name }}
                  </p>
                </a>
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold capitalize" [class]="statusClass(e.status)">
                  {{ ('OBSERVER_EVAL.STATUS.' + e.status.toUpperCase()) | translate }}
                </span>
              </div>

              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums flex-shrink-0"
                     [style.background]="band(e.overallRating).color + '22'" [style.color]="band(e.overallRating).color">
                  {{ e.overallRating }}
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ band(e.overallRating).key | translate }}</p>
                  <p class="text-xs" style="color:var(--text-muted)">{{ 'OBSERVER_EVAL.OVERALL' | translate }}</p>
                </div>
              </div>

              @if (isOwn(e)) {
                <div class="flex items-center gap-2 pt-1 border-t" style="border-color:var(--border-color)">
                  @if (e.status === 'draft') {
                    <a [routerLink]="['/observer-evaluations', e._id, 'edit']" class="btn btn-secondary btn-sm">{{ 'COMMON.EDIT' | translate }}</a>
                  }
                  @if (e.status !== 'published') {
                    <button type="button" class="btn btn-primary btn-sm" (click)="askPublish(e)">{{ 'OBSERVER_EVAL.PUBLISH' | translate }}</button>
                  }
                  @if (e.status === 'published') {
                    <button type="button" class="btn btn-secondary btn-sm" (click)="doArchive(e)">{{ 'OBSERVER_EVAL.ARCHIVE' | translate }}</button>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    @if (publishTarget()) {
      <app-confirm-dialog
        [title]="'OBSERVER_EVAL.PUBLISH_TITLE' | translate"
        [message]="'OBSERVER_EVAL.PUBLISH_MSG' | translate"
        [confirmLabel]="'OBSERVER_EVAL.PUBLISH' | translate"
        (confirmed)="doPublish()"
        (cancelled)="publishTarget.set(null)"
      />
    }
  `,
})
export class ObserverEvaluationListComponent implements OnInit {
  private readonly service = inject(ObserverEvaluationService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly evaluations = signal<ObserverEvaluation[]>([]);
  readonly loading = signal(true);
  readonly observerId = signal<string | null>(null);
  readonly publishTarget = signal<ObserverEvaluation | null>(null);

  readonly isAdmin = this.auth.isAdmin;
  readonly canCreate = computed(() => this.auth.isAdmin() && !!this.observerId());

  ngOnInit(): void {
    this.observerId.set(this.route.snapshot.queryParamMap.get('observer'));
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    const params: Record<string, string> = {};
    if (this.auth.isAdmin() && this.observerId()) params['observer'] = this.observerId()!;
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

  isOwn(e: ObserverEvaluation): boolean {
    return this.auth.isAdmin() && e.evaluator._id === this.auth.currentUser()?._id;
  }

  statusClass(status: string): string {
    if (status === 'published') return 'bg-green-100 text-green-700';
    if (status === 'archived') return 'bg-gray-200 text-gray-600';
    return 'bg-amber-100 text-amber-700';
  }

  askPublish(e: ObserverEvaluation): void { this.publishTarget.set(e); }

  doPublish(): void {
    const e = this.publishTarget();
    if (!e) return;
    this.service.publish(e._id).subscribe(() => {
      this.publishTarget.set(null);
      this.toast.success(this.translate.instant('OBSERVER_EVAL.PUBLISHED_OK'));
      this.load();
    });
  }

  doArchive(e: ObserverEvaluation): void {
    this.service.archive(e._id).subscribe(() => {
      this.toast.success(this.translate.instant('OBSERVER_EVAL.ARCHIVED_OK'));
      this.load();
    });
  }
}
