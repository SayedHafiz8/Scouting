import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ScoutingReportService } from '../services/scouting-report.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BreadcrumbContextService } from '../../../core/services/breadcrumb-context.service';
import { ScoutingReport } from '../../../core/models/scouting-report.model';
import { RatingBarComponent } from '../../../shared/components/rating-bar/rating-bar.component';
import { RadarChartComponent } from '../../../shared/components/radar-chart/radar-chart.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { REPORT_METRIC_GROUPS, RATING_MAX, ratingColorOf } from '../report-metrics';

@Component({
    selector: 'app-report-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [DatePipe, TranslatePipe, RatingBarComponent, RadarChartComponent, SkeletonLoaderComponent, ConfirmDialogComponent],
    template: `
    <div class="max-w-4xl mx-auto space-y-5">

      @if (loading()) {
        <app-skeleton-loader type="card" [count]="1" />
      } @else if (report()) {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

          <!-- Left: ratings -->
          <div class="lg:col-span-2 space-y-4">

            <!-- Overall + meta -->
            <div class="card p-5 flex items-center gap-5">
              <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0"
                   [style]="overallStyle(report()!.overallRating)">
                {{ report()!.overallRating }}
              </div>
              <div class="flex-1">
                @if (report()!.matchType === 'training') {
                  <p class="font-bold text-sm mb-0.5" style="color:var(--text-primary)">
                    {{ 'REPORTS.FORM.TRAINING' | translate }}
                  </p>
                } @else if (sideLabel('home') || sideLabel('away')) {
                  <p class="font-bold text-sm mb-0.5" style="color:var(--text-primary)">
                    {{ sideLabel('home') }} <span style="color:var(--text-muted);font-weight:600">vs</span> {{ sideLabel('away') }}
                  </p>
                }
                <p class="text-xs" style="color:var(--text-muted)">
                  {{ report()!.matchDate | date:'longDate' }}
                </p>
                @if (auth.isAdmin() && coachName()) {
                  <p class="text-xs mt-1.5 flex items-center gap-1.5" style="color:var(--text-muted)">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    {{ coachName() }}
                  </p>
                }
              </div>
              <!-- زرار التعديل اتشال: كان بيوجّه لـ['../edit'] واللي بيتحلّ لـ
                   reports/edit فبيطابق reports/:reportId بـreportId='edit' ويرجع
                   صفحة فاضية — الراوت ده مش موجود أصلاً. التقارير للقراءة بعد
                   الإنشاء، والأدمن وحده بيمسح. (قرار المالك 2026-11)

                   الحذف: الأدمن يقدر يمسح **أي** تقرير، مش تقاريره هو بس —
                   DELETE /scouting/:id أدمن-أونلي ومن غير أي حارس ملكية، فالزرار
                   هنا مطابق للسيرفر بالظبط (مقابل زرار التعديل في القايمة اللي
                   محدود بـisAuthoredByMe زي denyAdminEditingOthersReport). -->
              @if (auth.isAdmin()) {
                <button class="btn btn-ghost btn-icon text-danger-500 flex-shrink-0"
                        [title]="'COMMON.DELETE' | translate"
                        (click)="confirmDelete.set(true)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  </svg>
                </button>
              }
            </div>

            <!-- ══ بنود التقييم: 10 مجموعات / 31 بند، كل بند 1→10 ═════════════
                 لفّة واحدة على REPORT_METRIC_GROUPS بدل 3 كاردات مكتوبة بالإيد.
                 الصفوف محسوبة مسبقًا في ratingCards() — مفيش نداء دالة جوه
                 @for (قاعدة CLAUDE.md: 31 بند × كل دورة تغيير). -->
            @if (hasRatings()) {
              @for (card of ratingCards(); track card.key) {
                @if (card.sectionLabel) {
                  <h2 class="text-sm font-bold pt-2 ps-1" style="color:var(--text-primary)">
                    {{ card.sectionLabel | translate }}
                  </h2>
                }
                <div class="card p-5">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-xs font-semibold uppercase tracking-wide" [style.color]="card.color">
                      {{ card.label | translate }}
                    </h3>
                    <span class="text-sm font-black tabular-nums" [style.color]="card.averageColor">
                      {{ card.averageText }}
                    </span>
                  </div>
                  <div class="space-y-3">
                    @for (row of card.rows; track row.key) {
                      <app-rating-bar [label]="row.label | translate" [value]="row.value" [max]="ratingMax" />
                    }
                  </div>
                </div>
              }
            } @else {
              <!-- تقرير اتكتب قبل 2026-11-18 — بنود قديمة اتشالت من النظام بلا
                   migration (قرار المالك)، فمفيش حاجة تتعرض غير التقييم العام. -->
              <div class="card p-5">
                <p class="text-sm" style="color:var(--text-muted)">{{ 'REPORTS.DETAIL.LEGACY_RATINGS' | translate }}</p>
              </div>
            }

            @if (report()!.notes) {
              <div class="card p-5">
                <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color:var(--text-muted)">{{ 'REPORTS.DETAIL.NOTES' | translate }}</h3>
                <p class="text-sm" style="color:var(--text-primary)">{{ report()!.notes }}</p>
              </div>
            }
          </div>

          <!-- Right: radar — متوسط كل مجموعة (10 محاور)، مش الـ31 بند -->
          @if (hasRatings()) {
            <div>
              <div class="card p-5 sticky top-5">
                <h3 class="text-xs font-semibold uppercase tracking-wide mb-4 text-center" style="color:var(--text-muted)">{{ 'REPORTS.DETAIL.RADAR' | translate }}</h3>
                <app-radar-chart [data]="radarData()" [max]="ratingMax" />
              </div>
            </div>
          }
        </div>
      }
    </div>

    @if (confirmDelete()) {
      <app-confirm-dialog
        [title]="'REPORTS.DELETE_TITLE' | translate"
        [message]="'REPORTS.DELETE_MSG' | translate"
        [confirmLabel]="'COMMON.DELETE' | translate"
        [danger]="true"
        (confirmed)="doDelete()"
        (cancelled)="confirmDelete.set(false)"
      />
    }
  `
})
export class ReportDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reportService = inject(ScoutingReportService);
  private readonly breadcrumbContext = inject(BreadcrumbContextService);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);

  readonly report = signal<ScoutingReport | null>(null);
  readonly loading = signal(true);
  readonly confirmDelete = signal(false);
  readonly deleting = signal(false);

  private get playerId(): string {
    return this.route.snapshot.pathFromRoot
      .map(s => s.paramMap.get('playerId'))
      .find(id => id != null) ?? '';
  }

  ngOnInit(): void {
    const reportId = this.route.snapshot.paramMap.get('reportId')!;
    this.reportService.getOne(this.playerId, reportId).subscribe({
      next: res => {
        const document = (res.data as any)?.document ?? null;
        this.report.set(document);
        this.loading.set(false);
        // البريدكرمب في صفحة اللاعب لازم يعرض اسم كاتب الريبورت الفعلي (ممكن يكون أوبزيرفر مش الكوتش المسؤول عن اللاعب)
        const author = document?.coach;
        if (author && typeof author === 'object' && author._id) {
          this.breadcrumbContext.setReportAuthor({ id: author._id, name: author.name ?? '' });
        }
      },
      error: () => this.loading.set(false),
    });
  }

  ngOnDestroy(): void {
    this.breadcrumbContext.clearReportAuthor();
  }

  // الأدمن يمسح أي تقرير — DELETE /scouting/:id أدمن-أونلي ومن غير حارس ملكية.
  // بعد المسح بنرجع لقايمة تقارير اللاعب: الصفحة دي بقى مستندها مش موجود.
  doDelete(): void {
    const id = this.report()?._id;
    if (!id || this.deleting()) return;
    this.deleting.set(true);
    this.reportService.delete(this.playerId, id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmDelete.set(false);
          this.router.navigate(['/players', this.playerId, 'reports']);
        },
        error: () => {
          this.deleting.set(false);
          this.confirmDelete.set(false);
        },
      });
  }

  coachName(): string {
    const coach = this.report()?.coach;
    if (!coach) return '';
    return typeof coach === 'object' ? (coach as any).name ?? '' : '';
  }

  teamName(team: ScoutingReport['homeTeam']): string {
    if (!team) return '';
    return typeof team === 'string' ? team : team.name;
  }

  // فريق مسجل (ref) أو اسم حر (homeTeamName/awayTeamName) — أيهما موجود
  sideLabel(side: 'home' | 'away'): string {
    const r = this.report();
    if (!r) return '';
    const team = side === 'home' ? r.homeTeam : r.awayTeam;
    const name = side === 'home' ? r.homeTeamName : r.awayTeamName;
    return this.teamName(team) || name || '';
  }

  // ══ بنود التقييم ═══════════════════════════════════════════════════════
  // الكاردات والصفوف محسوبة مرة واحدة لما التقرير يوصل، مش في كل دورة تغيير —
  // 31 بند × نداء لكل صف كان بيبقى الحالة اللي CLAUDE.md بتمنعها بالحرف.

  readonly ratingMax = RATING_MAX;

  /** تقرير بالشكل الجديد (فيه مجموعة واحدة على الأقل من الـ10) */
  readonly hasRatings = computed(() => {
    const r = this.report() as Record<string, unknown> | null;
    if (!r) return false;
    return REPORT_METRIC_GROUPS.some(g => r[g.key] != null);
  });

  readonly ratingCards = computed(() => {
    const r = this.report() as unknown as Record<string, Record<string, number> | undefined> | null;
    if (!r) return [];

    return REPORT_METRIC_GROUPS.map(group => {
      const values = group.metrics.map(m => r[group.key]?.[m.key] ?? 0);
      const filled = values.filter(v => v > 0);
      const average = filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : 0;

      return {
        key: group.key,
        label: group.label,
        color: group.color,
        sectionLabel: group.sectionLabel,
        averageText: average ? average.toFixed(1) : '—',
        averageColor: ratingColorOf(average),
        rows: group.metrics.map((m, i) => ({ key: m.key, label: m.label, value: values[i] })),
      };
    });
  });

  /** متوسط كل مجموعة — 10 محاور بدل 28، عشان اللافتات تفضل مقروءة */
  readonly radarData = computed<Record<string, number>>(() => {
    const cards = this.ratingCards();
    const out: Record<string, number> = {};
    REPORT_METRIC_GROUPS.forEach((group, i) => {
      const rows = cards[i]?.rows ?? [];
      const filled = rows.map(row => row.value).filter(v => v > 0);
      out[group.short] = filled.length ? +(filled.reduce((a, b) => a + b, 0) / filled.length).toFixed(2) : 0;
    });
    return out;
  });

  // السلّم الحالي 1→10، وبرضه 1→10 للتقارير القديمة (اللي قبل استبدال البنود)،
  // فالتلوين واحد للاتنين. التقارير اللي اتكتبت في أسبوع سلّم 1→5 بتتلوّن
  // بالسلّم الواسع فبتبان أقل من حقيقتها — أثر جانبي معروف لقرار "بلا migration".
  overallStyle(rating: number): string {
    const color = ratingColorOf(rating, this.hasRatings() ? RATING_MAX : 10);
    return `background:${color}18; color:${color}`;
  }

}
