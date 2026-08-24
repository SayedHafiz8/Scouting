import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { User } from '../../../core/models/user.model';
import { Team } from '../../../core/models/team.model';
import { SeasonMatch, SeasonMatchPayload, SeasonMatchStatus } from '../../../core/models/season-match.model';
import { UserService } from '../../users/services/user.service';
import { TeamService } from '../../teams/services/team.service';
import { SeasonMatchService } from '../../season-matches/services/season-match.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { toArabic } from '../../../core/interceptors/error.interceptor';

interface MatchFormState {
  _id: string | null;
  season: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
}

const emptyMatchForm = (): MatchFormState => ({
  _id: null,
  season: currentSeason(),
  matchDate: '',
  homeTeam: '',
  awayTeam: '',
  venue: '',
});

function currentSeason(): string {
  const year = new Date().getFullYear();
  return `${year}/${year + 1}`;
}

@Component({
  selector: 'app-professional-league-page',
  imports: [FormsModule, RouterLink, DatePipe, SkeletonLoaderComponent, EmptyStateComponent, ConfirmDialogComponent, TranslatePipe],
  template: `
    <div class="max-w-4xl mx-auto space-y-6">

      <div>
        <h1 class="page-title">{{ 'PROFESSIONAL_LEAGUE.TITLE' | translate }}</h1>
        <p class="page-subtitle">{{ 'PROFESSIONAL_LEAGUE.SUBTITLE' | translate }}</p>
      </div>

      <!-- ══════ ProScouts section ══════ -->
      <section class="card p-5 md:p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-base font-bold" style="color:var(--text-primary)">{{ 'PROFESSIONAL_LEAGUE.PROSCOUTS_SECTION' | translate }}</h2>
            <p class="text-xs mt-0.5" style="color:var(--text-muted)">{{ 'PROSCOUTS.SUBTITLE' | translate }}</p>
          </div>
          <a routerLink="/professional-league/pro-scouts/new" [queryParams]="{ role: 'proScout' }" class="btn btn-secondary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {{ 'PROSCOUTS.ADD' | translate }}
          </a>
        </div>

        @if (proScoutsLoading()) {
          <app-skeleton-loader type="table-row" [count]="3" />
        } @else if (proScouts().length === 0) {
          <app-empty-state
            [title]="'PROSCOUTS.EMPTY' | translate"
            [message]="'PROSCOUTS.EMPTY_MSG' | translate"
            [actionLabel]="'PROSCOUTS.ADD' | translate"
            (actionClicked)="router.navigate(['/professional-league/pro-scouts/new'], { queryParams: { role: 'proScout' } })" />
        } @else {
          <ul class="flex flex-wrap gap-2">
            @for (u of proScouts(); track u._id) {
              <li class="px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 cursor-pointer transition-colors hover:bg-[var(--bg-card-hover)]"
                  [class.opacity-40]="!u.active"
                  style="background:var(--bg-secondary);color:var(--text-primary)"
                  (click)="router.navigate(['/professional-league/pro-scouts', u._id])">
                <span class="font-medium">{{ u.name }}</span>
                <span style="color:var(--text-muted)">— {{ u.email }}</span>
              </li>
            }
          </ul>
        }
      </section>

      <!-- ══════ Teams section ══════ -->
      <section class="card p-5 md:p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-base font-bold" style="color:var(--text-primary)">{{ 'PROFESSIONAL_LEAGUE.TEAMS_SECTION' | translate }}</h2>
            <p class="text-xs mt-0.5" style="color:var(--text-muted)">{{ 'TEAMS.SUBTITLE' | translate }}</p>
          </div>
          @if (!showTeamForm()) {
            <button type="button" class="btn btn-secondary btn-sm" (click)="showTeamForm.set(true)">
              {{ 'TEAMS.ADD' | translate }}
            </button>
          }
        </div>

        @if (showTeamForm()) {
          <div class="rounded-xl p-4 mb-4" style="background:var(--bg-secondary)">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'TEAMS.NAME' | translate }}</label>
                <input [(ngModel)]="newTeamName" type="text" class="form-input text-sm" [placeholder]="'TEAMS.NAME_PH' | translate" />
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'TEAMS.CLUB_NAME' | translate }}</label>
                <input [(ngModel)]="newTeamClubName" type="text" class="form-input text-sm" [placeholder]="'TEAMS.CLUB_NAME_PH' | translate" />
              </div>
            </div>
            <div class="flex gap-3 mt-3">
              <button type="button" class="btn btn-primary btn-sm" (click)="createTeam()">{{ 'COMMON.SAVE' | translate }}</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="cancelTeamForm()">{{ 'COMMON.CANCEL' | translate }}</button>
            </div>
          </div>
        }

        @if (teamsLoading()) {
          <app-skeleton-loader type="table-row" [count]="2" />
        } @else if (teams().length === 0) {
          <p class="text-sm flex items-center gap-2" style="color:var(--text-muted)">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ 'TEAMS.EMPTY' | translate }}
          </p>
        } @else {
          <ul class="flex flex-wrap gap-2">
            @for (t of teams(); track t._id) {
              <li class="px-3 py-1.5 rounded-lg text-sm flex items-center gap-2" style="background:var(--bg-secondary);color:var(--text-primary)">
                <span class="font-medium">{{ t.name }}</span>
                <span style="color:var(--text-muted)">— {{ t.clubName }}</span>
                <button type="button" class="text-danger-500 hover:text-danger-600" [attr.aria-label]="'COMMON.DELETE' | translate" (click)="teamDeleteTarget.set(t)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </li>
            }
          </ul>
        }
      </section>

      <!-- ══════ Matches section ══════ -->
      <section class="card p-5 md:p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-base font-bold" style="color:var(--text-primary)">{{ 'PROFESSIONAL_LEAGUE.MATCHES_SECTION' | translate }}</h2>
            <p class="text-xs mt-0.5" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.SUBTITLE' | translate }}</p>
          </div>
          @if (!showMatchForm()) {
            <button type="button" class="btn btn-primary btn-sm" (click)="openCreateMatchForm()" [disabled]="teams().length < 2">
              {{ 'SEASON_MATCHES.ADD' | translate }}
            </button>
          }
        </div>

        @if (teams().length < 2 && !showMatchForm()) {
          <p class="text-xs mb-4 flex items-center gap-2" style="color:var(--text-muted)">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ 'SEASON_MATCHES.NEED_TEAMS_HINT' | translate }}
          </p>
        }

        @if (showMatchForm()) {
          <div class="rounded-xl p-4 mb-4 space-y-3" style="background:var(--bg-secondary)">
            @if (matchFieldError('_form')) {
              <div class="form-error-banner">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                </svg>
                <span>{{ matchFieldError('_form') }}</span>
              </div>
            }
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'SEASON_MATCHES.SEASON' | translate }}</label>
                <input [(ngModel)]="matchForm.season" type="text" class="form-input text-sm" placeholder="2025/2026"
                       [class.form-input-error]="(matchFormSubmitted() && !matchForm.season.trim()) || matchFieldError('season')" />
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'SEASON_MATCHES.MATCH_DATE' | translate }}</label>
                <input [(ngModel)]="matchForm.matchDate" type="date" [min]="todayDateString" class="form-input text-sm"
                       [class.form-input-error]="(matchFormSubmitted() && !matchForm.matchDate) || matchFieldError('matchDate')" />
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'SEASON_MATCHES.VENUE' | translate }}</label>
                <input [(ngModel)]="matchForm.venue" type="text" class="form-input text-sm" [placeholder]="'SEASON_MATCHES.VENUE_PH' | translate"
                       [class.form-input-error]="matchFieldError('venue')" />
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'SEASON_MATCHES.HOME_TEAM' | translate }}</label>
                <select [(ngModel)]="matchForm.homeTeam" class="form-input text-sm"
                        [class.form-input-error]="(matchFormSubmitted() && !matchForm.homeTeam) || matchFieldError('homeTeam')">
                  <option value="">{{ 'SEASON_MATCHES.SELECT_TEAM' | translate }}</option>
                  @for (t of teams(); track t._id) {
                    <option [value]="t._id">{{ t.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'SEASON_MATCHES.AWAY_TEAM' | translate }}</label>
                <select [(ngModel)]="matchForm.awayTeam" class="form-input text-sm"
                        [class.form-input-error]="(matchFormSubmitted() && (!matchForm.awayTeam || matchForm.homeTeam === matchForm.awayTeam)) || matchFieldError('awayTeam')">
                  <option value="">{{ 'SEASON_MATCHES.SELECT_TEAM' | translate }}</option>
                  @for (t of teams(); track t._id) {
                    <option [value]="t._id">{{ t.name }}</option>
                  }
                </select>
                @if (matchFormSubmitted() && matchForm.homeTeam && matchForm.awayTeam && matchForm.homeTeam === matchForm.awayTeam) {
                  <p class="field-error">{{ 'SEASON_MATCHES.SAME_TEAM_ERR' | translate }}</p>
                }
              </div>
            </div>
            <div class="flex gap-3 pt-1">
              <button type="button" class="btn btn-primary btn-sm" (click)="saveMatch()">{{ 'COMMON.SAVE' | translate }}</button>
              <button type="button" class="btn btn-secondary btn-sm" (click)="cancelMatchForm()">{{ 'COMMON.CANCEL' | translate }}</button>
            </div>
          </div>
        }

        @if (matchesLoading()) {
          <app-skeleton-loader type="table-row" [count]="3" />
        } @else if (matches().length === 0) {
          <app-empty-state [title]="'SEASON_MATCHES.EMPTY' | translate" [message]="'SEASON_MATCHES.EMPTY_MSG' | translate" />
        } @else {
          <div class="overflow-x-auto -mx-1">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b" style="border-color:var(--border-color)">
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.MATCH_DATE' | translate }}</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.FIXTURE' | translate }}</th>
                  <th class="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.VENUE' | translate }}</th>
                  <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'AGE_GROUPS.COL_ACTIONS' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (m of matches(); track m._id) {
                  <tr class="border-b last:border-0" style="border-color:var(--border-subtle)">
                    <td class="px-3 py-3 whitespace-nowrap" style="color:var(--text-secondary)">{{ m.matchDate | date:'mediumDate' }}</td>
                    <td class="px-3 py-3 font-medium" style="color:var(--text-primary)">
                      {{ teamName(m.homeTeam) }} <span style="color:var(--text-muted)">vs</span> {{ teamName(m.awayTeam) }}
                      @if (m.status === 'completed' && m.result) {
                        <span class="ms-1.5 text-xs font-semibold" style="color:var(--text-muted)">({{ m.result.homeScore }}–{{ m.result.awayScore }})</span>
                      }
                    </td>
                    <td class="px-3 py-3" style="color:var(--text-secondary)">{{ m.venue || '—' }}</td>
                    <td class="px-3 py-3 text-right whitespace-nowrap">
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'COMMON.EDIT' | translate" (click)="openEditMatchForm(m)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'SEASON_MATCHES.ENTER_RESULT' | translate" (click)="openResultForm(m)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                        </svg>
                      </button>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm text-danger-500" [attr.aria-label]="'COMMON.DELETE' | translate" (click)="matchDeleteTarget.set(m)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                  @if (resultMatchId() === m._id) {
                    <tr>
                      <td [attr.colspan]="4" class="px-4 py-4" style="background:var(--bg-secondary)">
                        <div class="flex flex-wrap items-end gap-3">
                          <div>
                            <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'SEASON_MATCHES.STATUS_LABEL' | translate }}</label>
                            <select [(ngModel)]="resultForm.status" class="form-input text-sm !w-auto">
                              <option value="completed">{{ 'SEASON_MATCHES.STATUS.COMPLETED' | translate }}</option>
                              <option value="postponed">{{ 'SEASON_MATCHES.STATUS.POSTPONED' | translate }}</option>
                              <option value="cancelled">{{ 'SEASON_MATCHES.STATUS.CANCELLED' | translate }}</option>
                            </select>
                          </div>
                          @if (resultForm.status === 'completed') {
                            <div class="flex items-end gap-2">
                              <div>
                                <label class="block text-xs font-medium mb-1 truncate max-w-[140px]" style="color:var(--text-secondary)">{{ teamName(m.homeTeam) }}</label>
                                <input [(ngModel)]="resultForm.homeScore" type="number" min="0" class="form-input text-sm" style="width:70px" />
                              </div>
                              <span class="pb-2.5 text-sm" style="color:var(--text-muted)">–</span>
                              <div>
                                <label class="block text-xs font-medium mb-1 truncate max-w-[140px]" style="color:var(--text-secondary)">{{ teamName(m.awayTeam) }}</label>
                                <input [(ngModel)]="resultForm.awayScore" type="number" min="0" class="form-input text-sm" style="width:70px" />
                              </div>
                            </div>
                          }
                          <button type="button" class="btn btn-primary btn-sm" [disabled]="savingResult()" (click)="saveResult(m)">{{ 'COMMON.SAVE' | translate }}</button>
                          <button type="button" class="btn btn-secondary btn-sm" (click)="resultMatchId.set(null)">{{ 'COMMON.CANCEL' | translate }}</button>
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>

    @if (teamDeleteTarget()) {
      <app-confirm-dialog
        [title]="'TEAMS.DELETE_TITLE' | translate"
        [message]="'TEAMS.DELETE_MSG' | translate:{name: teamDeleteTarget()!.name}"
        [confirmLabel]="'COMMON.DELETE' | translate"
        [danger]="true"
        (confirmed)="doDeleteTeam()"
        (cancelled)="teamDeleteTarget.set(null)"
      />
    }

    @if (matchDeleteTarget()) {
      <app-confirm-dialog
        [title]="'SEASON_MATCHES.DELETE_TITLE' | translate"
        [message]="'SEASON_MATCHES.DELETE_MSG' | translate"
        [confirmLabel]="'COMMON.DELETE' | translate"
        [danger]="true"
        (confirmed)="doDeleteMatch()"
        (cancelled)="matchDeleteTarget.set(null)"
      />
    }
  `
})
export class ProfessionalLeaguePageComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly teamService = inject(TeamService);
  private readonly seasonMatchService = inject(SeasonMatchService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  readonly auth = inject(AuthService);
  readonly router = inject(Router);

  readonly proScouts = signal<User[]>([]);
  readonly proScoutsLoading = signal(true);

  readonly teams = signal<Team[]>([]);
  readonly teamsLoading = signal(true);
  readonly showTeamForm = signal(false);
  readonly teamDeleteTarget = signal<Team | null>(null);
  newTeamName = '';
  newTeamClubName = '';

  readonly matches = signal<SeasonMatch[]>([]);
  readonly matchesLoading = signal(true);
  readonly showMatchForm = signal(false);
  readonly matchFormSubmitted = signal(false);
  readonly matchFieldErrors = signal<Record<string, string>>({});
  readonly matchDeleteTarget = signal<SeasonMatch | null>(null);
  matchForm: MatchFormState = emptyMatchForm();
  readonly todayDateString = new Date().toISOString().slice(0, 10);

  readonly resultMatchId = signal<string | null>(null);
  readonly savingResult = signal(false);
  resultForm: { status: SeasonMatchStatus; homeScore: number; awayScore: number } = { status: 'completed', homeScore: 0, awayScore: 0 };

  ngOnInit(): void {
    this.loadProScouts();
    this.loadTeams();
    this.loadMatches();
  }

  loadProScouts(): void {
    this.proScoutsLoading.set(true);
    this.userService.getAll({ sort: 'name', role: 'proScout' }).subscribe({
      next: res => {
        this.proScouts.set((res.data as any)?.documents ?? []);
        this.proScoutsLoading.set(false);
      },
      error: () => this.proScoutsLoading.set(false),
    });
  }

  loadTeams(): void {
    this.teamsLoading.set(true);
    this.teamService.getAll(undefined, 'professional').subscribe({
      next: res => {
        this.teams.set(res.data?.documents ?? []);
        this.teamsLoading.set(false);
      },
      error: () => this.teamsLoading.set(false),
    });
  }

  loadMatches(): void {
    this.matchesLoading.set(true);
    this.seasonMatchService.getAll({ league: 'professional', sort: '-matchDate' }).subscribe({
      next: res => {
        this.matches.set(res.data?.documents ?? []);
        this.matchesLoading.set(false);
      },
      error: () => this.matchesLoading.set(false),
    });
  }

  teamName(team: Team | string): string {
    return typeof team === 'string' ? team : team.name;
  }

  // ── Teams ──────────────────────────────────────────────────────────────────
  createTeam(): void {
    if (!this.newTeamName.trim() || !this.newTeamClubName.trim()) return;
    this.teamService.create({
      name: this.newTeamName.trim(),
      clubName: this.newTeamClubName.trim(),
      league: 'professional',
    }).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('TEAMS.ADD'));
        this.cancelTeamForm();
        this.loadTeams();
      },
    });
  }

  cancelTeamForm(): void {
    this.showTeamForm.set(false);
    this.newTeamName = '';
    this.newTeamClubName = '';
  }

  doDeleteTeam(): void {
    const t = this.teamDeleteTarget();
    if (!t) return;
    this.teamService.delete(t._id).subscribe({
      next: () => {
        this.teamDeleteTarget.set(null);
        this.toast.success(this.translate.instant('COMMON.DELETE'));
        this.loadTeams();
      },
      error: (err: HttpErrorResponse) => {
        this.teamDeleteTarget.set(null);
        this.toast.error(toArabic(err.error?.message) || err.error?.message || this.translate.instant('COMMON.ERROR'));
      },
    });
  }

  // ── Season matches ──────────────────────────────────────────────────────────
  openCreateMatchForm(): void {
    this.matchForm = emptyMatchForm();
    this.matchFormSubmitted.set(false);
    this.matchFieldErrors.set({});
    this.showMatchForm.set(true);
  }

  openEditMatchForm(m: SeasonMatch): void {
    this.matchForm = {
      _id: m._id,
      season: m.season,
      matchDate: m.matchDate?.split('T')[0] ?? '',
      homeTeam: typeof m.homeTeam === 'string' ? m.homeTeam : m.homeTeam._id,
      awayTeam: typeof m.awayTeam === 'string' ? m.awayTeam : m.awayTeam._id,
      venue: m.venue ?? '',
    };
    this.matchFormSubmitted.set(false);
    this.matchFieldErrors.set({});
    this.showMatchForm.set(true);
  }

  cancelMatchForm(): void {
    this.showMatchForm.set(false);
    this.matchForm = emptyMatchForm();
    this.matchFormSubmitted.set(false);
    this.matchFieldErrors.set({});
  }

  saveMatch(): void {
    const f = this.matchForm;
    this.matchFormSubmitted.set(true);
    this.matchFieldErrors.set({});
    if (!f.season.trim() || !f.matchDate || !f.homeTeam || !f.awayTeam || f.homeTeam === f.awayTeam) {
      return;
    }

    const payload: SeasonMatchPayload = {
      season: f.season.trim(),
      league: 'professional',
      matchDate: new Date(f.matchDate).toISOString(),
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      venue: f.venue.trim() || undefined,
    };

    const req$ = f._id
      ? this.seasonMatchService.update(f._id, payload)
      : this.seasonMatchService.create(payload);

    req$.subscribe({
      next: () => {
        this.toast.success(this.translate.instant('COMMON.SAVE'));
        this.cancelMatchForm();
        this.loadMatches();
      },
      error: (err: HttpErrorResponse) => this.matchFieldErrors.set(this.extractFieldErrors(err)),
    });
  }

  private extractFieldErrors(err: HttpErrorResponse): Record<string, string> {
    const list: any[] = err.error?.errors;
    if (!Array.isArray(list)) return {};
    const map: Record<string, string> = {};
    for (const e of list) {
      const path: string = e.path || e.param || '_form';
      if (map[path]) continue;
      map[path] = toArabic(e.msg ?? e.message ?? '') || e.msg || e.message;
    }
    return map;
  }

  matchFieldError(path: string): string {
    return this.matchFieldErrors()[path] ?? '';
  }

  doDeleteMatch(): void {
    const m = this.matchDeleteTarget();
    if (!m) return;
    this.seasonMatchService.delete(m._id).subscribe(() => {
      this.matchDeleteTarget.set(null);
      this.toast.success(this.translate.instant('COMMON.DELETE'));
      this.loadMatches();
    });
  }

  openResultForm(m: SeasonMatch): void {
    this.resultForm = {
      status: m.status === 'scheduled' ? 'completed' : m.status,
      homeScore: m.result?.homeScore ?? 0,
      awayScore: m.result?.awayScore ?? 0,
    };
    this.resultMatchId.set(m._id);
  }

  saveResult(m: SeasonMatch): void {
    this.savingResult.set(true);
    const payload = this.resultForm.status === 'completed'
      ? { status: this.resultForm.status, result: { homeScore: this.resultForm.homeScore, awayScore: this.resultForm.awayScore } }
      : { status: this.resultForm.status };

    this.seasonMatchService.updateStatus(m._id, payload).subscribe({
      next: () => {
        this.savingResult.set(false);
        this.resultMatchId.set(null);
        this.toast.success(this.translate.instant('COMMON.SAVE'));
        this.loadMatches();
      },
      error: () => this.savingResult.set(false),
    });
  }
}
