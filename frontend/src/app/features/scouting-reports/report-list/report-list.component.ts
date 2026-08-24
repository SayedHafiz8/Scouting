import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ScoutingReportService } from '../services/scouting-report.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PlayerContextService } from '../../../core/services/player-context.service';
import { ScoutingReport, ReportStatistics } from '../../../core/models/scouting-report.model';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { RadarChartComponent } from '../../../shared/components/radar-chart/radar-chart.component';

@Component({
    selector: 'app-report-list',
    imports: [RouterLink, DatePipe, FormsModule, TranslatePipe, SkeletonLoaderComponent, EmptyStateComponent, ConfirmDialogComponent, RadarChartComponent],
    styles: [`
      .overall-ring {
        width: 68px; height: 68px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        border: 3px solid; transition: border-color 0.3s, color 0.3s;
        margin: 0 auto;
      }
      .cat-bar-fill { height: 5px; border-radius: 9999px; transition: width 0.4s ease; }
    `],
    template: `
    <div class="space-y-5">

      <!-- ══ Page header: count + add-report — full width, above both columns ══ -->
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium" style="color:var(--text-secondary)">
          {{ 'REPORTS.COUNT' | translate:{ count: filteredReports().length } }}
          @if (hasActiveFilter()) {
            <span class="text-xs ml-1" style="color:var(--text-muted)">{{ 'REPORTS.OF' | translate:{ total: reports().length } }}</span>
          }
        </p>
        @if (auth.isCoach() || auth.isObserver()) {
          <a [routerLink]="['new']" class="btn btn-primary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {{ 'REPORTS.ADD' | translate }}
          </a>
        }
      </div>

      <!-- ══ Two columns, both starting at the same level (the author-role chips / stats card top) ══ -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

      <!-- ══ Main column: filters, report list ══ -->
      <div class="lg:col-span-2 space-y-4">

        <!-- Author role — standalone chip row above the filter card (like the player status chips) -->
        @if (auth.isAdmin() && !loading()) {
          <div class="flex flex-wrap gap-2.5" role="group" [attr.aria-label]="'REPORTS.FILTER.AUTHOR_ROLE' | translate">
            <button type="button" class="status-chip status-chip-coach" [class.status-chip-on]="authorRoleFilter() !== 'observer'"
                    [attr.aria-pressed]="authorRoleFilter() !== 'observer'" (click)="toggleAuthorRole('coach')">
              <span class="chip-dot" style="background:#3b82f6"></span>
              {{ 'NAV.COACHES' | translate }}
              <span class="chip-badge">{{ authorCounts().coach }}</span>
            </button>
            <button type="button" class="status-chip status-chip-observer" [class.status-chip-on]="authorRoleFilter() === 'observer'"
                    [attr.aria-pressed]="authorRoleFilter() === 'observer'" (click)="toggleAuthorRole('observer')">
              <span class="chip-dot" style="background:#a855f7"></span>
              {{ 'NAV.OBSERVERS' | translate }}
              <span class="chip-badge">{{ authorCounts().observer }}</span>
            </button>
          </div>
        }

        <!-- Filter panel -->
        @if (!loading() && reports().length > 0) {
          <div class="card p-4 space-y-4">

            <!-- Header row -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                     style="background:rgba(34,197,94,0.12)">
                  <svg class="w-3.5 h-3.5" style="color:#22c55e" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                  </svg>
                </div>
                <span class="text-sm font-semibold" style="color:var(--text-primary)">{{ 'REPORTS.FILTER.TITLE' | translate }}</span>
                @if (hasActiveFilter()) {
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                        style="background:rgba(34,197,94,0.14);color:#4ade80">
                    {{ filteredReports().length }} / {{ reports().length }}
                  </span>
                }
              </div>
            </div>

            <!-- Divider -->
            <div style="height:1px;background:var(--border-color)"></div>

            <!-- Fields -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <div class="space-y-1.5">
                <label class="block text-xs font-medium" style="color:var(--text-secondary)">{{ 'REPORTS.FILTER.MIN_RATING' | translate }}</label>
                <select [ngModel]="filterMinRating()" (ngModelChange)="filterMinRating.set(+$event)" class="form-input text-xs py-2">
                  <option [ngValue]="0">{{ 'REPORTS.FILTER.ALL' | translate }}</option>
                  <option [ngValue]="5">5+</option>
                  <option [ngValue]="7">7+</option>
                  <option [ngValue]="9">9+</option>
                </select>
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-medium" style="color:var(--text-secondary)">{{ 'REPORTS.FILTER.FROM_DATE' | translate }}</label>
                <input type="date" [ngModel]="filterDateFrom()" (ngModelChange)="filterDateFrom.set($event)"
                       class="form-input text-xs py-2" />
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-medium" style="color:var(--text-secondary)">{{ 'REPORTS.FILTER.TO_DATE' | translate }}</label>
                <input type="date" [ngModel]="filterDateTo()" (ngModelChange)="filterDateTo.set($event)"
                       class="form-input text-xs py-2" />
              </div>
              <div class="space-y-1.5">
                <label class="block text-xs font-medium" style="color:var(--text-secondary)">{{ 'REPORTS.FILTER.SORT_BY' | translate }}</label>
                <select [ngModel]="filterSort()" (ngModelChange)="filterSort.set($event)" class="form-input text-xs py-2">
                  <option value="default">{{ 'REPORTS.FILTER.DEFAULT' | translate }}</option>
                  <option value="desc">{{ 'REPORTS.FILTER.HIGHEST' | translate }}</option>
                  <option value="asc">{{ 'REPORTS.FILTER.LOWEST' | translate }}</option>
                </select>
              </div>
            </div>

          </div>
        }

        @if (loading()) {
          <app-skeleton-loader type="table-row" [count]="5" />
        } @else if (reports().length === 0) {
          <app-empty-state
            [title]="'REPORTS.EMPTY_TITLE' | translate"
            [message]="'REPORTS.EMPTY_MSG' | translate"
            [actionLabel]="(auth.isCoach() || auth.isObserver()) ? ('REPORTS.ADD' | translate) : null"
            (actionClicked)="navigateToNew()"
            [icon]="reportIcon"
          />
        } @else if (filteredReports().length === 0) {
          <div class="text-center py-10" style="color:var(--text-muted)">
            <svg class="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            <p class="text-sm">{{ 'REPORTS.NO_MATCH' | translate }}</p>
          </div>
        } @else {
          <div class="space-y-3">
            @for (report of filteredReports(); track report._id) {
              <div class="card p-4 hover:shadow-card-md transition-shadow">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <!-- Overall rating circle -->
                    <div class="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0"
                         [style]="ratingStyle(report.overallRating)">
                      {{ report.overallRating }}
                    </div>
                    <div>
                      @if (report.matchType === 'training') {
                        <p class="font-semibold text-sm" style="color:var(--text-primary)">
                          {{ 'REPORTS.FORM.TRAINING' | translate }}
                        </p>
                        <p class="text-xs mt-0.5" style="color:var(--text-muted)">{{ report.matchDate | date:'mediumDate' }}</p>
                      } @else if (sideLabel(report, 'home') || sideLabel(report, 'away')) {
                        <p class="font-semibold text-sm" style="color:var(--text-primary)">
                          {{ sideLabel(report, 'home') }} <span style="color:var(--text-muted);font-weight:500">vs</span> {{ sideLabel(report, 'away') }}
                        </p>
                        <p class="text-xs mt-0.5" style="color:var(--text-muted)">{{ report.matchDate | date:'mediumDate' }}</p>
                      } @else {
                        <p class="font-semibold text-sm" style="color:var(--text-primary)">
                          {{ report.matchDate | date:'mediumDate' }}
                        </p>
                      }
                      @if (auth.isAdmin() && coachName(report)) {
                        <p class="text-xs mt-0.5 flex items-center gap-1" style="color:var(--text-muted)">
                          <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                          </svg>
                          {{ coachName(report) }}
                        </p>
                      }
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <a [routerLink]="[report._id]" class="btn btn-ghost btn-icon btn-sm" title="View">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                      </svg>
                    </a>
                    @if (auth.isCoach() || auth.isObserver()) {
                      <a [routerLink]="[report._id]" class="btn btn-ghost btn-icon btn-sm" title="Edit">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </a>
                    }
                    @if (auth.isAdmin()) {
                      <button class="btn btn-ghost btn-icon btn-sm text-danger-500" (click)="deleteTarget.set(report)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                        </svg>
                      </button>
                    }
                  </div>
                </div>

                @if (report.notes) {
                  <p class="text-xs mt-3 pt-3 border-t" style="border-color:var(--border-subtle); color:var(--text-secondary)">
                    {{ report.notes }}
                  </p>
                }
              </div>
            }
          </div>
        }
      </div>

      <!-- ══ Sidebar: overall report average — sticky, stays in place while the list scrolls ══ -->
      <!-- نفس ترتيب الكاردين اللي الكشاف شايفهم وهو بيعمل تقرير: التقييم الكلي فوق، مخطط المهارات تحت -->
      @if (statistics()) {
        <div class="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div class="card p-4 text-center">
            <p class="text-xs font-semibold uppercase tracking-widest mb-3" style="color:var(--text-muted)">
              {{ 'REPORTS.FORM.OVERALL' | translate }}
            </p>
            <div class="overall-ring" [style]="overallRingStyle()">
              <div>
                <div class="text-xl font-black leading-none tabular-nums">{{ statistics()!.overallRating }}</div>
                <div class="text-[10px] font-medium mt-0.5" style="color:var(--text-muted)">/ 10</div>
              </div>
            </div>
            <p class="text-[11px] mt-2.5" style="color:var(--text-muted)">
              {{ 'PLAYERS.DETAIL.STATS_SUBTITLE' | translate:{count: statistics()!.totalReports} }}
            </p>

            <div class="mt-4 space-y-2.5 text-left">
              <div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-[11px] font-semibold" style="color:#22c55e">{{ 'REPORTS.FORM.TECHNICAL' | translate }}</span>
                  <span class="text-[11px] font-bold tabular-nums" style="color:#22c55e">{{ categoryAverage('technical') }}</span>
                </div>
                <div class="h-1 rounded-full" style="background:rgba(34,197,94,0.12)">
                  <div class="cat-bar-fill" style="background:#22c55e" [style.width]="(categoryAverageNum('technical') * 10) + '%'"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-[11px] font-semibold" style="color:#38bdf8">{{ 'REPORTS.FORM.PHYSICAL' | translate }}</span>
                  <span class="text-[11px] font-bold tabular-nums" style="color:#38bdf8">{{ categoryAverage('physical') }}</span>
                </div>
                <div class="h-1 rounded-full" style="background:rgba(56,189,248,0.12)">
                  <div class="cat-bar-fill" style="background:#38bdf8" [style.width]="(categoryAverageNum('physical') * 10) + '%'"></div>
                </div>
              </div>
              <div>
                <div class="flex justify-between items-center mb-1">
                  <span class="text-[11px] font-semibold" style="color:#8b5cf6">{{ 'REPORTS.FORM.MENTAL' | translate }}</span>
                  <span class="text-[11px] font-bold tabular-nums" style="color:#8b5cf6">{{ categoryAverage('mental') }}</span>
                </div>
                <div class="h-1 rounded-full" style="background:rgba(139,92,246,0.12)">
                  <div class="cat-bar-fill" style="background:#8b5cf6" [style.width]="(categoryAverageNum('mental') * 10) + '%'"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="card p-3">
            <p class="text-xs font-semibold uppercase tracking-widest mb-2 text-center" style="color:var(--text-muted)">
              {{ 'REPORTS.FORM.RADAR' | translate }}
            </p>
            <app-radar-chart [data]="radarData()" />

            <!-- متوسط كل مهارة على حدة (مش بس متوسط الفئة) -->
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3 pt-3" style="border-top:1px solid var(--border-subtle)">
              @for (skill of skillAverages(); track skill.key) {
                <div class="flex items-center justify-between gap-1.5">
                  <span class="text-[11px] truncate" style="color:var(--text-secondary)">{{ skill.label }}</span>
                  <span class="text-[11px] font-bold tabular-nums flex-shrink-0" [style.color]="skill.color">{{ skill.value.toFixed(1) }}</span>
                </div>
              }
            </div>
          </div>
        </div>
      }
      </div>
      <!-- ══ end two-column grid ══ -->
    </div>

    @if (deleteTarget()) {
      <app-confirm-dialog
        [title]="'REPORTS.DELETE_TITLE' | translate"
        [message]="'REPORTS.DELETE_MSG' | translate"
        [confirmLabel]="'COMMON.DELETE' | translate"
        [danger]="true"
        (confirmed)="doDelete()"
        (cancelled)="deleteTarget.set(null)"
      />
    }
  `
})
export class ReportListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reportService = inject(ScoutingReportService);
  private readonly translate = inject(TranslateService);
  private readonly playerContext = inject(PlayerContextService);
  readonly auth = inject(AuthService);

  readonly reports = signal<ScoutingReport[]>([]);
  readonly loading = signal(true);
  readonly deleteTarget = signal<ScoutingReport | null>(null);

  // متوسط تقارير اللاعب — التقييم الكلي + متوسط كل مهارة، بيظهر فوق الليستة.
  // بيتحط من PlayerDetailComponent (نفس الريكوست بالظبط)، مش من ريكوست منفصل هنا —
  // عشان الاتنين كانوا بيتنفذوا مع بعض بسبب redirectTo على مسار reports وبيسببوا
  // تكرار في التوست لما اللاعب لسه ملوش تقارير
  readonly statistics = this.playerContext.reportStatistics;

  // Filter state — must be signals so computed() reacts to changes
  readonly filterMinRating = signal(0);
  readonly filterDateFrom  = signal('');
  readonly filterDateTo    = signal('');
  readonly filterSort      = signal<'default' | 'asc' | 'desc'>('default');
  // Admin-only — server-side filter: coach's reports vs observer's reports.
  // الافتراضي "coach" فعليًا (مش مجرد شكل) عشان الشيب اللي شكله معلّم يطابق الفلترة الحقيقية من أول تحميل
  readonly authorRoleFilter = signal<'' | 'coach' | 'observer'>('coach');
  // عدد ريبورتات الكوتشات/الأوبزيرفرز على اللاعب ده — بيبان كبادچ على كل شيب بغض النظر عن الفلتر الحالي
  readonly authorCounts = signal<{ coach: number; observer: number }>({ coach: 0, observer: 0 });

  readonly filteredReports = computed(() => {
    let list = [...this.reports()];
    const minR  = this.filterMinRating();
    const from  = this.filterDateFrom();
    const to    = this.filterDateTo();
    const sort  = this.filterSort();
    if (minR)  list = list.filter(r => r.overallRating >= minR);
    if (from)  list = list.filter(r => r.matchDate >= from);
    if (to)    list = list.filter(r => r.matchDate <= to + 'T23:59:59');
    if (sort === 'desc') list.sort((a, b) => b.overallRating - a.overallRating);
    if (sort === 'asc')  list.sort((a, b) => a.overallRating - b.overallRating);
    return list;
  });

  readonly hasActiveFilter = computed(() =>
    this.filterMinRating() > 0 ||
    !!this.filterDateFrom() || !!this.filterDateTo() || this.filterSort() !== 'default'
  );

  readonly reportIcon = `<svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>`;

  private get playerId(): string {
    return this.route.snapshot.pathFromRoot
      .map(s => s.paramMap.get('playerId'))
      .find(id => id != null) ?? '';
  }

  ngOnInit(): void {
    // لو داخلين من صفحة أوبزيرفر معين (?authorRole=observer من صفحة اللاعبين) نفتح على طول على فلتر الأوبزيرفر
    const queryAuthorRole = this.route.snapshot.queryParamMap.get('authorRole');
    if (queryAuthorRole === 'observer' || queryAuthorRole === 'coach') {
      this.authorRoleFilter.set(queryAuthorRole);
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const params: Record<string, unknown> = { sort: '-matchDate' };
    if (this.auth.isAdmin() && this.authorRoleFilter()) params['authorRole'] = this.authorRoleFilter();
    this.reportService.getAll(this.playerId, params).subscribe({
      next: res => {
        this.reports.set((res.data as any)?.documents ?? []);
        if ((res as any).authorCounts) this.authorCounts.set((res as any).authorCounts);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // الضغط على أيقونة يفلتر فعليًا على الريبورتس الخاصة بيها بس؛ الضغط عليها تانى يرجع لعرض الكل
  // الكوتش بيفضل شكله معلّم افتراضيًا طول ما الفلتر مش على الاوبزيرفر (شرط العرض في الـ template)
  toggleAuthorRole(value: 'coach' | 'observer'): void {
    this.authorRoleFilter.set(this.authorRoleFilter() === value ? '' : value);
    this.load();
  }

  resetFilters(): void {
    this.filterMinRating.set(0);
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.filterSort.set('default');
  }

  navigateToNew(): void {
    this.router.navigate(['new'], { relativeTo: this.route });
  }

  doDelete(): void {
    const r = this.deleteTarget();
    if (!r) return;
    this.reportService.delete(this.playerId, r._id).subscribe(() => {
      this.deleteTarget.set(null);
      this.load();
    });
  }

  coachName(report: ScoutingReport): string {
    if (!report.coach) return '';
    return typeof report.coach === 'object' ? (report.coach as any).name ?? '' : '';
  }

  teamName(team: ScoutingReport['homeTeam']): string {
    if (!team) return '';
    return typeof team === 'string' ? team : team.name;
  }

  // فريق مسجل (ref) أو اسم حر (homeTeamName/awayTeamName) — أيهما موجود
  sideLabel(report: ScoutingReport, side: 'home' | 'away'): string {
    const team = side === 'home' ? report.homeTeam : report.awayTeam;
    const name = side === 'home' ? report.homeTeamName : report.awayTeamName;
    return this.teamName(team) || name || '';
  }

  ratingStyle(rating: number): string {
    const color = rating >= 8 ? '#22c55e' : rating >= 5 ? '#f59e0b' : '#f43f5e';
    return `background:${color}20; color:${color}`;
  }

  private ratingColor(rating: number | null | undefined): string {
    if (rating == null) return 'var(--text-muted)';
    return rating >= 8 ? '#22c55e' : rating >= 5 ? '#f59e0b' : '#f43f5e';
  }

  overallRingStyle(): string {
    const color = this.ratingColor(this.statistics()?.overallRating);
    return `border-color:${color}; color:${color}`;
  }

  radarData(): Record<string, number> {
    const s = this.statistics();
    if (!s) return {};
    return {
      passing: s.passing ?? 0, dribbling: s.dribbling ?? 0, shooting: s.shooting ?? 0, ballControl: s.ballControl ?? 0,
      speed: s.speed ?? 0, stamina: s.stamina ?? 0, strength: s.strength ?? 0, agility: s.agility ?? 0,
      positioning: s.positioning ?? 0, decisionMaking: s.decisionMaking ?? 0, teamwork: s.teamwork ?? 0, attitude: s.attitude ?? 0,
    };
  }

  private categoryFields(category: 'technical' | 'physical' | 'mental'): (keyof ReportStatistics)[] {
    if (category === 'technical') return ['passing', 'dribbling', 'shooting', 'ballControl'];
    if (category === 'physical') return ['speed', 'stamina', 'strength', 'agility'];
    return ['positioning', 'decisionMaking', 'teamwork', 'attitude'];
  }

  categoryAverageNum(category: 'technical' | 'physical' | 'mental'): number {
    const s = this.statistics();
    if (!s) return 0;
    const values = this.categoryFields(category).map(f => s[f] as number).filter(v => v != null);
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  categoryAverage(category: 'technical' | 'physical' | 'mental'): string {
    return this.statistics() ? this.categoryAverageNum(category).toFixed(1) : '—';
  }

  // متوسط كل مهارة من الـ 12 لوحدها (مش بس متوسط الفئة) — بتتحط تحت الـ radar chart
  skillAverages(): { key: string; label: string; value: number; color: string }[] {
    const s = this.statistics();
    if (!s) return [];
    const skills: { key: keyof ReportStatistics; labelKey: string; color: string }[] = [
      { key: 'passing', labelKey: 'REPORTS.FORM.PASSING', color: '#22c55e' },
      { key: 'dribbling', labelKey: 'REPORTS.FORM.DRIBBLING', color: '#22c55e' },
      { key: 'shooting', labelKey: 'REPORTS.FORM.SHOOTING', color: '#22c55e' },
      { key: 'ballControl', labelKey: 'REPORTS.FORM.BALL_CONTROL', color: '#22c55e' },
      { key: 'speed', labelKey: 'REPORTS.FORM.SPEED', color: '#38bdf8' },
      { key: 'stamina', labelKey: 'REPORTS.FORM.STAMINA', color: '#38bdf8' },
      { key: 'strength', labelKey: 'REPORTS.FORM.STRENGTH', color: '#38bdf8' },
      { key: 'agility', labelKey: 'REPORTS.FORM.AGILITY', color: '#38bdf8' },
      { key: 'positioning', labelKey: 'REPORTS.FORM.POSITIONING', color: '#8b5cf6' },
      { key: 'decisionMaking', labelKey: 'REPORTS.FORM.DECISION_MAKING', color: '#8b5cf6' },
      { key: 'teamwork', labelKey: 'REPORTS.FORM.TEAMWORK', color: '#8b5cf6' },
      { key: 'attitude', labelKey: 'REPORTS.FORM.ATTITUDE', color: '#8b5cf6' },
    ];
    return skills.map(sk => ({
      key: sk.key,
      label: this.translate.instant(sk.labelKey),
      value: (s[sk.key] as number) ?? 0,
      color: sk.color,
    }));
  }

}
