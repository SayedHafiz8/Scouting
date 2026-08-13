import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ScoutingReportService } from '../services/scouting-report.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BreadcrumbContextService } from '../../../core/services/breadcrumb-context.service';
import { ScoutingReport } from '../../../core/models/scouting-report.model';
import { RatingBarComponent } from '../../../shared/components/rating-bar/rating-bar.component';
import { RadarChartComponent } from '../../../shared/components/radar-chart/radar-chart.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';

@Component({
    selector: 'app-report-detail',
    imports: [RouterLink, DatePipe, TranslatePipe, RatingBarComponent, RadarChartComponent, SkeletonLoaderComponent],
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
              @if (auth.isCoach()) {
                <a [routerLink]="['../edit']" class="btn btn-secondary btn-sm">{{ 'REPORTS.DETAIL.EDIT' | translate }}</a>
              }
            </div>

            <!-- Technical -->
            <div class="card p-5">
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-4 text-primary-600">{{ 'REPORTS.DETAIL.TECHNICAL' | translate }}</h3>
              <div class="space-y-3">
                <app-rating-bar [label]="'REPORTS.FORM.PASSING' | translate" [value]="report()!.technical.passing" />
                <app-rating-bar [label]="'REPORTS.FORM.DRIBBLING' | translate" [value]="report()!.technical.dribbling" />
                <app-rating-bar [label]="'REPORTS.FORM.SHOOTING' | translate" [value]="report()!.technical.shooting" />
                <app-rating-bar [label]="'REPORTS.FORM.BALL_CONTROL' | translate" [value]="report()!.technical.ballControl" />
              </div>
            </div>

            <!-- Physical -->
            <div class="card p-5">
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-4 text-accent-600">{{ 'REPORTS.DETAIL.PHYSICAL' | translate }}</h3>
              <div class="space-y-3">
                <app-rating-bar [label]="'REPORTS.FORM.SPEED' | translate" [value]="report()!.physical.speed" />
                <app-rating-bar [label]="'REPORTS.FORM.STAMINA' | translate" [value]="report()!.physical.stamina" />
                <app-rating-bar [label]="'REPORTS.FORM.STRENGTH' | translate" [value]="report()!.physical.strength" />
                <app-rating-bar [label]="'REPORTS.FORM.AGILITY' | translate" [value]="report()!.physical.agility" />
              </div>
            </div>

            <!-- Mental -->
            <div class="card p-5">
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-4" style="color:#8b5cf6">{{ 'REPORTS.DETAIL.MENTAL' | translate }}</h3>
              <div class="space-y-3">
                <app-rating-bar [label]="'REPORTS.FORM.POSITIONING' | translate" [value]="report()!.mental.positioning" />
                <app-rating-bar [label]="'REPORTS.FORM.DECISION_MAKING' | translate" [value]="report()!.mental.decisionMaking" />
                <app-rating-bar [label]="'REPORTS.FORM.TEAMWORK' | translate" [value]="report()!.mental.teamwork" />
                <app-rating-bar [label]="'REPORTS.FORM.ATTITUDE' | translate" [value]="report()!.mental.attitude" />
              </div>
            </div>

            @if (report()!.notes) {
              <div class="card p-5">
                <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color:var(--text-muted)">{{ 'REPORTS.DETAIL.NOTES' | translate }}</h3>
                <p class="text-sm" style="color:var(--text-primary)">{{ report()!.notes }}</p>
              </div>
            }
          </div>

          <!-- Right: radar -->
          <div>
            <div class="card p-5 sticky top-5">
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-4 text-center" style="color:var(--text-muted)">{{ 'REPORTS.DETAIL.RADAR' | translate }}</h3>
              <app-radar-chart [data]="radarData()" />
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class ReportDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly reportService = inject(ScoutingReportService);
  private readonly breadcrumbContext = inject(BreadcrumbContextService);
  readonly auth = inject(AuthService);

  readonly report = signal<ScoutingReport | null>(null);
  readonly loading = signal(true);

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

  radarData(): Record<string, number> {
    const r = this.report();
    if (!r) return {};
    return {
      passing: r.technical.passing, dribbling: r.technical.dribbling,
      shooting: r.technical.shooting, ballControl: r.technical.ballControl,
      speed: r.physical.speed, stamina: r.physical.stamina,
      strength: r.physical.strength, agility: r.physical.agility,
      positioning: r.mental.positioning, decisionMaking: r.mental.decisionMaking,
      teamwork: r.mental.teamwork, attitude: r.mental.attitude,
    };
  }

  overallStyle(rating: number): string {
    const color = rating >= 8 ? '#22c55e' : rating >= 5 ? '#f59e0b' : '#f43f5e';
    return `background:${color}18; color:${color}`;
  }

}
