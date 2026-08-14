import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AgeGroup } from '../../../core/models/age-group.model';
import { ApiResponse, Pagination } from '../../../core/models/api-response.model';
import { Team } from '../../../core/models/team.model';
import { User } from '../../../core/models/user.model';
import { SeasonMatch, SeasonMatchPayload, SeasonMatchReport, SeasonMatchMedia, SeasonMatchLeague } from '../../../core/models/season-match.model';
import { Player } from '../../../core/models/player.model';
import { TeamService } from '../../teams/services/team.service';
import { SeasonMatchService } from '../../season-matches/services/season-match.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { toArabic } from '../../../core/interceptors/error.interceptor';

interface MatchFormState {
  _id: string | null;
  season: string;
  league: SeasonMatchLeague;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
}

const emptyMatchForm = (): MatchFormState => ({
  _id: null,
  season: '',
  league: 'premier',
  matchDate: '',
  homeTeam: '',
  awayTeam: '',
  venue: '',
});

// Sentinel used by the season <select> to reveal the free-text fallback input
const CUSTOM_SEASON = '__custom__';

// "YYYY/YYYY" academic-year seasons around today — last year, current, and 3 ahead
function generatedSeasons(): string[] {
  const year = new Date().getFullYear();
  const seasons: string[] = [];
  for (let y = year + 3; y >= year - 1; y--) {
    seasons.push(`${y}/${y + 1}`);
  }
  return seasons;
}

// Best-guess "current" season for a fresh match — the one starting this year
function currentSeason(): string {
  const year = new Date().getFullYear();
  return `${year}/${year + 1}`;
}

@Component({
  selector: 'app-age-group-detail',
  imports: [FormsModule, CommonModule, RouterLink, SkeletonLoaderComponent, EmptyStateComponent, ConfirmDialogComponent, TranslatePipe],
  template: `
    <div class="max-w-4xl mx-auto space-y-6">

      <!-- Breadcrumb -->
      <nav class="flex items-center gap-2 text-sm" style="color:var(--text-muted)">
        <a routerLink="/age-groups" class="hover:text-primary-600">{{ 'AGE_GROUPS.TITLE' | translate }}</a>
        <span>/</span>
        <span style="color:var(--text-primary)">{{ ageGroup()?.name ?? '…' }}</span>
      </nav>

      @if (loading()) {
        <app-skeleton-loader type="card" [count]="2" />
      } @else {

        <!-- ══════ League toggle — scopes both the teams list and the match schedule below ══════ -->
        <div class="grid grid-cols-2 gap-3">
          <button type="button" (click)="selectLeague('premier')"
                  class="flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-colors font-semibold text-sm"
                  [style.border-color]="selectedLeague() === 'premier' ? 'var(--accent)' : 'var(--border-color)'"
                  [style.background]="selectedLeague() === 'premier' ? 'rgba(34,197,94,0.08)' : 'transparent'"
                  [style.color]="selectedLeague() === 'premier' ? 'var(--accent)' : 'var(--text-secondary)'">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/>
              <path d="M7 5H4a2 2 0 0 0 2 4M17 5h3a2 2 0 0 1-2 4"/>
            </svg>
            {{ 'SEASON_MATCHES.LEAGUE_PREMIER' | translate }}
          </button>
          <button type="button" (click)="selectLeague('professional')"
                  class="flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-colors font-semibold text-sm"
                  [style.border-color]="selectedLeague() === 'professional' ? 'var(--accent)' : 'var(--border-color)'"
                  [style.background]="selectedLeague() === 'professional' ? 'rgba(34,197,94,0.08)' : 'transparent'"
                  [style.color]="selectedLeague() === 'professional' ? 'var(--accent)' : 'var(--text-secondary)'">
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 2l2.5 5.5L20 8.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1L12 2z"/>
            </svg>
            {{ 'SEASON_MATCHES.LEAGUE_PROFESSIONAL' | translate }}
          </button>
        </div>

        <!-- ══════ Teams section ══════ -->
        <section class="card p-5 md:p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h2 class="text-base font-bold" style="color:var(--text-primary)">{{ 'TEAMS.TITLE' | translate }}</h2>
              <p class="text-xs mt-0.5" style="color:var(--text-muted)">{{ 'TEAMS.SUBTITLE' | translate }}</p>
            </div>
            @if (auth.isAdmin() && !showTeamForm()) {
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

          @if (teams().length === 0) {
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
                  @if (auth.isAdmin()) {
                    <button type="button" class="text-danger-500 hover:text-danger-600" [attr.aria-label]="'COMMON.DELETE' | translate" (click)="teamDeleteTarget.set(t)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  }
                </li>
              }
            </ul>
          }
        </section>

        <!-- ══════ Season match schedule ══════ -->
        <section class="card p-5 md:p-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 class="text-base font-bold" style="color:var(--text-primary)">{{ 'SEASON_MATCHES.TITLE' | translate }}</h2>
              <p class="text-xs mt-0.5" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.SUBTITLE' | translate }}</p>
            </div>
            <div class="flex items-center gap-2">
              <select [(ngModel)]="seasonFilter" (ngModelChange)="onSeasonFilterChange()" class="form-input text-sm !w-auto">
                <option value="">{{ 'SEASON_MATCHES.ALL_SEASONS' | translate }}</option>
                @for (s of filterSeasonOptions(); track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
              @if (auth.isAdmin() && !showMatchForm()) {
                <button type="button" class="btn btn-primary btn-sm" (click)="openCreateMatchForm()" [disabled]="teams().length < 2">
                  {{ 'SEASON_MATCHES.ADD' | translate }}
                </button>
              }
            </div>
          </div>

          @if (auth.isAdmin() && teams().length < 2 && !showMatchForm()) {
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
                  <select [ngModel]="seasonSelectValue()" (ngModelChange)="onSeasonSelectChange($event)" class="form-input text-sm"
                          [class.form-input-error]="(matchFormSubmitted() && !matchForm.season.trim()) || matchFieldError('season')">
                    @for (s of seasonChoices(); track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                    <option [value]="CUSTOM_SEASON">{{ 'SEASON_MATCHES.CUSTOM_SEASON' | translate }}</option>
                  </select>
                  @if (seasonSelectValue() === CUSTOM_SEASON) {
                    <input [(ngModel)]="matchForm.season" type="text" class="form-input text-sm mt-2" placeholder="2025/2026"
                           [class.form-input-error]="(matchFormSubmitted() && !matchForm.season.trim()) || matchFieldError('season')"
                           [attr.aria-label]="'SEASON_MATCHES.SEASON' | translate" />
                    <p class="text-[11px] mt-1" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.CUSTOM_SEASON_HINT' | translate }}</p>
                  }
                  @if (matchFormSubmitted() && !matchForm.season.trim()) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ 'SEASON_MATCHES.SEASON_ERR' | translate }}
                    </p>
                  } @else if (matchFieldError('season')) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ matchFieldError('season') }}
                    </p>
                  }
                </div>
                <div>
                  <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'SEASON_MATCHES.MATCH_DATE' | translate }}</label>
                  <input [(ngModel)]="matchForm.matchDate" type="date" [min]="todayDateString" class="form-input text-sm"
                         [class.form-input-error]="(matchFormSubmitted() && !matchForm.matchDate) || matchFieldError('matchDate')" />
                  @if (matchFormSubmitted() && !matchForm.matchDate) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ 'SEASON_MATCHES.MATCH_DATE_ERR' | translate }}
                    </p>
                  } @else if (matchFieldError('matchDate')) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ matchFieldError('matchDate') }}
                    </p>
                  }
                </div>
                <div>
                  <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'SEASON_MATCHES.VENUE' | translate }}</label>
                  <input [(ngModel)]="matchForm.venue" type="text" class="form-input text-sm" [placeholder]="'SEASON_MATCHES.VENUE_PH' | translate"
                         [class.form-input-error]="matchFieldError('venue')" />
                  @if (matchFieldError('venue')) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ matchFieldError('venue') }}
                    </p>
                  }
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
                  @if (matchFormSubmitted() && !matchForm.homeTeam) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ 'SEASON_MATCHES.HOME_TEAM_ERR' | translate }}
                    </p>
                  } @else if (matchFieldError('homeTeam')) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ matchFieldError('homeTeam') }}
                    </p>
                  }
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
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ 'SEASON_MATCHES.SAME_TEAM_ERR' | translate }}
                    </p>
                  } @else if (matchFormSubmitted() && !matchForm.awayTeam) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ 'SEASON_MATCHES.AWAY_TEAM_ERR' | translate }}
                    </p>
                  } @else if (matchFieldError('awayTeam')) {
                    <p class="field-error">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                      {{ matchFieldError('awayTeam') }}
                    </p>
                  }
                </div>
              </div>
              <p class="text-xs flex items-center gap-1.5" style="color:var(--text-muted)">
                <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {{ 'SEASON_MATCHES.STATUS_HANDLED_BY_COACH' | translate }}
              </p>

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
                    @if (auth.isAdmin()) {
                      <th class="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'AGE_GROUPS.COL_ACTIONS' | translate }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (m of matches(); track m._id) {
                    <tr [class]="'border-b last:border-0' + (isPastMatch(m) ? ' cursor-pointer hover:opacity-80' : '')" style="border-color:var(--border-subtle)"
                        (click)="isPastMatch(m) && toggleMatchReports(m)">
                      <td class="px-3 py-3 whitespace-nowrap" style="color:var(--text-secondary)">{{ m.matchDate | date:'mediumDate' }}</td>
                      <td class="px-3 py-3 font-medium" style="color:var(--text-primary)">
                        {{ teamName(m.homeTeam) }} <span style="color:var(--text-muted)">vs</span> {{ teamName(m.awayTeam) }}
                        @if (m.status === 'completed' && m.result) {
                          <span class="ms-1.5 text-xs font-semibold" style="color:var(--text-muted)">({{ m.result.homeScore }}–{{ m.result.awayScore }})</span>
                        }
                        @if (isPastMatch(m)) {
                          <svg class="inline-block w-3 h-3 ms-1.5 align-middle transition-transform" [class.rotate-180]="expandedMatchId() === m._id"
                               fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        }
                        @if (auth.isAdmin()) {
                          @if (matchAttendees(m).length === 0) {
                            <p class="text-[11px] mt-1 font-normal" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.NO_ATTENDEES' | translate }}</p>
                          } @else {
                            <p class="text-[11px] mt-1 font-normal flex items-center gap-1 flex-wrap" style="color:var(--text-muted)" (click)="$event.stopPropagation()">
                              <svg class="w-3 h-3 flex-shrink-0" style="color:#22c55e" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                              </svg>
                              @for (a of matchAttendees(m); track a._id; let last = $last) {
                                <a [routerLink]="attendeeLink(a)" class="hover:underline" style="color:#16a34a" (click)="$event.stopPropagation()">{{ a.name }}</a>@if (!last) {<span>،</span>}
                              }
                            </p>
                          }
                        }
                      </td>
                      <td class="px-3 py-3" style="color:var(--text-secondary)">{{ m.venue || '—' }}</td>
                      @if (auth.isAdmin()) {
                        <td class="px-3 py-3 text-right whitespace-nowrap" (click)="$event.stopPropagation()">
                          @if (!isPastMatch(m)) {
                            <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'COMMON.EDIT' | translate" (click)="openEditMatchForm(m)">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button type="button" class="btn btn-ghost btn-icon btn-sm text-danger-500" [attr.aria-label]="'COMMON.DELETE' | translate" (click)="matchDeleteTarget.set(m)">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                              </svg>
                            </button>
                          } @else {
                            <span class="text-xs" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.MATCH_LOCKED' | translate }}</span>
                          }
                        </td>
                      }
                    </tr>
                    @if (expandedMatchId() === m._id) {
                      <tr>
                        <td [attr.colspan]="4" class="px-4 py-4" style="background:var(--bg-secondary)">
                          <div class="flex gap-1 mb-3" (click)="$event.stopPropagation()">
                            <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                    [class]="matchDetailTab() === 'reports' ? 'bg-primary-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'"
                                    (click)="matchDetailTab.set('reports')">
                              {{ 'SEASON_MATCHES.TABS.REPORTS' | translate }} ({{ matchReports().length }})
                            </button>
                            <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                    [class]="matchDetailTab() === 'media' ? 'bg-primary-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'"
                                    (click)="matchDetailTab.set('media')">
                              {{ 'SEASON_MATCHES.TABS.MEDIA' | translate }} ({{ matchMedia().length }})
                            </button>
                          </div>

                          @if (matchReportsLoading()) {
                            <app-skeleton-loader type="table-row" [count]="2" />
                          } @else if (matchDetailTab() === 'reports') {
                            @if (matchReports().length === 0) {
                              <p class="text-xs" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.NO_REPORTS' | translate }}</p>
                            } @else {
                              <ul class="space-y-1.5">
                                @for (r of matchReports(); track r._id) {
                                  <li class="flex items-center justify-between text-sm">
                                    <a [routerLink]="['/players', reportPlayerId(r), 'reports', r._id]" class="font-medium hover:underline" style="color:var(--text-primary)" (click)="$event.stopPropagation()">
                                      {{ reportPlayerName(r) }}
                                    </a>
                                    <span class="text-xs font-semibold" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.OVERALL_RATING' | translate }}: {{ r.overallRating }}</span>
                                  </li>
                                }
                              </ul>
                            }
                          } @else {
                            @if (matchMedia().length === 0) {
                              <p class="text-xs" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.NO_MEDIA' | translate }}</p>
                            } @else {
                              <ul class="space-y-1.5">
                                @for (item of matchMedia(); track item._id) {
                                  <li class="flex items-center justify-between text-sm gap-2">
                                    <div class="flex items-center gap-2 min-w-0">
                                      <svg class="w-3.5 h-3.5 flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                        @if (item.type === 'video') {
                                          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                                        } @else {
                                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                                        }
                                      </svg>
                                      <!-- Video playback is admin-only (bandwidth control); coaches/observers see the title only -->
                                      @if (item.type !== 'video' || auth.isAdmin()) {
                                        <a [href]="item.embedUrl || item.url" target="_blank" rel="noopener" class="font-medium hover:underline truncate" style="color:var(--text-primary)" (click)="$event.stopPropagation()">
                                          {{ item.title || mediaPlayerName(item) }}
                                        </a>
                                      } @else {
                                        <span class="font-medium truncate" style="color:var(--text-primary)">{{ item.title || mediaPlayerName(item) }}</span>
                                      }
                                      <span class="text-xs flex-shrink-0" style="color:var(--text-muted)">— {{ mediaUploaderName(item) }}</span>
                                    </div>
                                    @if (item.reviewStatus) {
                                      <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" [class]="reviewBadgeClass(item.reviewStatus)">
                                        {{ 'MEDIA.REVIEW.' + item.reviewStatus.toUpperCase() | translate }}
                                      </span>
                                    }
                                  </li>
                                }
                              </ul>
                            }
                          }
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>

            @if (matchesPagination() && matchesPagination()!.numberOfPages > 1) {
              <div class="flex items-center justify-between pt-4">
                <p class="text-sm" style="color:var(--text-muted)">
                  {{ 'SEASON_MATCHES.PAGE_OF' | translate:{ current: matchesPagination()!.currentPage, total: matchesPagination()!.numberOfPages } }}
                </p>
                <div class="flex items-center gap-2">
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="matchesPage() === 1"
                          (click)="changeMatchesPage(matchesPage() - 1)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    {{ 'SEASON_MATCHES.PREV' | translate }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" [disabled]="matchesPage() === matchesPagination()!.numberOfPages"
                          (click)="changeMatchesPage(matchesPage() + 1)">
                    {{ 'SEASON_MATCHES.NEXT' | translate }}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>
              </div>
            }
          }
        </section>
      }
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
  `,
  styles: [`
    /* Collapsible attendees picker header */
    .attendee-toggle {
      min-height: 40px;
      padding-top: 8px;
      padding-bottom: 8px;
      background: transparent;
      border: none;
      cursor: pointer;
    }
    .attendee-toggle:hover {
      background: rgba(34,197,94,0.06);
    }
    .attendee-toggle:focus-visible {
      outline: 2px solid #22c55e;
      outline-offset: -2px;
    }

    /* Attendees selectable list — one row per coach/observer */
    .attendee-row {
      min-height: 44px;
      cursor: pointer;
      background: transparent;
      border: none;
      border-radius: 0;
    }
    .attendee-row:hover {
      background: rgba(34,197,94,0.08);
    }
    .attendee-row:focus-visible {
      outline: 2px solid #22c55e;
      outline-offset: -2px;
    }
    .attendee-row-selected {
      background: rgba(34,197,94,0.12);
    }
    .attendee-row-selected:hover {
      background: rgba(34,197,94,0.16);
    }
    .attendee-check {
      width: 20px;
      height: 20px;
      border-radius: 9999px;
      border: 2px solid rgba(34,197,94,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
    }
    .attendee-check svg {
      width: 12px;
      height: 12px;
    }
    .attendee-check-on {
      background: #22c55e;
      border-color: #22c55e;
      transform: scale(1.05);
    }
    @media (prefers-reduced-motion: reduce) {
      .attendee-check { transition: none; }
    }
  `]
})
export class AgeGroupDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly teamService = inject(TeamService);
  private readonly seasonMatchService = inject(SeasonMatchService);
  private readonly agesBase = `${environment.apiUrl}/ages`;

  readonly auth = inject(AuthService);

  private ageGroupId = '';
  readonly ageGroup = signal<AgeGroup | null>(null);
  readonly loading = signal(true);

  readonly teams = signal<Team[]>([]);
  readonly showTeamForm = signal(false);
  readonly teamDeleteTarget = signal<Team | null>(null);
  newTeamName = '';
  newTeamClubName = '';

  readonly matches = signal<SeasonMatch[]>([]);
  readonly matchesLoading = signal(true);
  readonly matchesPagination = signal<Pagination | null>(null);
  readonly matchesPage = signal(1);
  private static readonly MATCHES_PAGE_SIZE = 20;
  readonly showMatchForm = signal(false);
  readonly matchFormSubmitted = signal(false);
  // server-side validation errors keyed by field path (e.g. "homeTeam"); '_form' holds whole-form errors (e.g. duplicate fixture)
  readonly matchFieldErrors = signal<Record<string, string>>({});
  readonly matchDeleteTarget = signal<SeasonMatch | null>(null);
  readonly expandedMatchId = signal<string | null>(null);
  readonly matchReports = signal<SeasonMatchReport[]>([]);
  readonly matchMedia = signal<SeasonMatchMedia[]>([]);
  readonly matchReportsLoading = signal(false);
  readonly matchDetailTab = signal<'reports' | 'media'>('reports');
  // الدوري الحالي المعروض في الصفحة — بيحدد إن الفرق والجدول الظاهرين لأي دوري (الممتاز افتراضيًا)
  readonly selectedLeague = signal<SeasonMatchLeague>('premier');
  seasonFilter = currentSeason();
  matchForm: MatchFormState = emptyMatchForm();
  readonly todayDateString = new Date().toISOString().slice(0, 10);

  readonly CUSTOM_SEASON = CUSTOM_SEASON;
  // every season that already has at least one match for this age group (unaffected by the season filter)
  readonly allSeasons = signal<string[]>([]);
  readonly seasonSelectValue = signal('');

  // known seasons + a few generated "YYYY/YYYY" candidates around today, deduped, most recent first
  readonly seasonChoices = computed(() => {
    const set = new Set([...this.allSeasons(), ...generatedSeasons()]);
    return Array.from(set).sort().reverse();
  });

  // seasons for the filter dropdown — always includes the current season even with no matches yet
  readonly filterSeasonOptions = computed(() => {
    const set = new Set([...this.allSeasons(), currentSeason()]);
    return Array.from(set).sort().reverse();
  });

  ngOnInit(): void {
    this.ageGroupId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loading.set(true);
    this.http.get<ApiResponse<{ document: AgeGroup }>>(`${this.agesBase}/${this.ageGroupId}`).subscribe({
      next: (res) => {
        this.ageGroup.set(res.data?.document ?? null);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.loadTeams();
    this.loadMatches();
    this.loadAllSeasons();
  }

  // بيقفل أي فورم مفتوح ويعيد تحميل الفرق والجدول لما الأدمن يبدّل الدوري المعروض
  selectLeague(league: SeasonMatchLeague): void {
    if (this.selectedLeague() === league) return;
    this.selectedLeague.set(league);
    this.cancelTeamForm();
    this.cancelMatchForm();
    this.expandedMatchId.set(null);
    this.matchesPage.set(1);
    this.loadTeams();
    this.loadMatches();
    this.loadAllSeasons();
  }

  loadTeams(): void {
    this.teamService.getAll(this.ageGroupId, this.selectedLeague()).subscribe(res => {
      this.teams.set(res.data?.documents ?? []);
    });
  }

  loadMatches(): void {
    this.matchesLoading.set(true);
    this.seasonMatchService.getAll({
      ageGroup: this.ageGroupId,
      league: this.selectedLeague(),
      season: this.seasonFilter || undefined,
      page: this.matchesPage(),
      limit: AgeGroupDetailComponent.MATCHES_PAGE_SIZE,
    }).subscribe({
      next: (res) => {
        this.matches.set(res.data?.documents ?? []);
        this.matchesPagination.set(res.pagination ?? null);
        this.matchesLoading.set(false);
      },
      error: () => this.matchesLoading.set(false),
    });
  }

  // فلتر الموسم بيتغيّر → نرجع لأول صفحة، وإلا ممكن نقف على صفحة متبقاش موجودة
  // لو النتايج بقت أقل من عدد صفحات الفلتر السابق
  onSeasonFilterChange(): void {
    this.matchesPage.set(1);
    this.loadMatches();
  }

  changeMatchesPage(page: number): void {
    this.matchesPage.set(page);
    this.loadMatches();
  }

  // فتحت من غير فلتر موسم، فبتفضل بتعكس كل المواسم المستخدمة لحد دلوقتي — لكن مقصورة على الدوري الحالي
  private loadAllSeasons(): void {
    this.seasonMatchService.getAll({ ageGroup: this.ageGroupId, league: this.selectedLeague() }).subscribe(res => {
      const set = new Set((res.data?.documents ?? []).map(m => m.season));
      this.allSeasons.set(Array.from(set));
    });
  }

  onSeasonSelectChange(value: string): void {
    this.seasonSelectValue.set(value);
    this.matchForm.season = value === CUSTOM_SEASON ? '' : value;
  }

  teamName(team: Team | string): string {
    return typeof team === 'string' ? team : team.name;
  }

  // scouts self-enroll — the admin's match list shows who's attending each match
  matchAttendees(m: SeasonMatch): User[] {
    return (m.attendees ?? []).filter((a): a is User => typeof a !== 'string');
  }

  attendeeLink(u: User): string[] {
    return u.role === 'observer' ? ['/observers', u._id] : ['/users', u._id];
  }

  isPastMatch(m: SeasonMatch): boolean {
    return new Date(m.matchDate).getTime() < Date.now();
  }

  toggleMatchReports(m: SeasonMatch): void {
    if (this.expandedMatchId() === m._id) {
      this.expandedMatchId.set(null);
      return;
    }
    this.expandedMatchId.set(m._id);
    this.matchDetailTab.set('reports');
    this.matchReportsLoading.set(true);
    this.seasonMatchService.getOne(m._id).subscribe({
      next: (res) => {
        this.matchReports.set(res.data?.document.reports ?? []);
        this.matchMedia.set(res.data?.document.media ?? []);
        this.matchReportsLoading.set(false);
      },
      error: () => this.matchReportsLoading.set(false),
    });
  }

  reportPlayerId(r: SeasonMatchReport): string {
    return typeof r.player === 'string' ? r.player : r.player._id;
  }

  reportPlayerName(r: SeasonMatchReport): string {
    return typeof r.player === 'string' ? r.player : (r.player as Player).name;
  }

  mediaPlayerId(m: SeasonMatchMedia): string {
    return typeof m.player === 'string' ? m.player : m.player._id;
  }

  mediaPlayerName(m: SeasonMatchMedia): string {
    return typeof m.player === 'string' ? m.player : (m.player as Player).name;
  }

  mediaUploaderName(m: SeasonMatchMedia): string {
    return typeof m.uploadedBy === 'string' ? m.uploadedBy : (m.uploadedBy as User).name;
  }

  reviewBadgeClass(status: string): string {
    if (status === 'approved') return 'bg-green-500/90 text-white';
    if (status === 'rejected') return 'bg-rose-500/90 text-white';
    return 'bg-amber-500/90 text-white';
  }

  // ── Teams ──────────────────────────────────────────────────────────────────
  createTeam(): void {
    if (!this.newTeamName.trim() || !this.newTeamClubName.trim()) return;
    this.teamService.create({
      name: this.newTeamName.trim(),
      clubName: this.newTeamClubName.trim(),
      ageGroup: this.ageGroupId,
      league: this.selectedLeague(),
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
    this.teamService.delete(t._id).subscribe(() => {
      this.teamDeleteTarget.set(null);
      this.toast.success(this.translate.instant('COMMON.DELETE'));
      this.loadTeams();
    });
  }

  // ── Season matches ──────────────────────────────────────────────────────────
  openCreateMatchForm(): void {
    this.matchForm = emptyMatchForm();
    this.matchForm.season = currentSeason();
    this.matchForm.league = this.selectedLeague();
    this.seasonSelectValue.set(this.seasonChoices().includes(this.matchForm.season) ? this.matchForm.season : CUSTOM_SEASON);
    this.matchFormSubmitted.set(false);
    this.matchFieldErrors.set({});
    this.showMatchForm.set(true);
  }

  openEditMatchForm(m: SeasonMatch): void {
    this.matchForm = {
      _id: m._id,
      season: m.season,
      league: this.selectedLeague(),
      matchDate: m.matchDate?.split('T')[0] ?? '',
      homeTeam: typeof m.homeTeam === 'string' ? m.homeTeam : m.homeTeam._id,
      awayTeam: typeof m.awayTeam === 'string' ? m.awayTeam : m.awayTeam._id,
      venue: m.venue ?? '',
    };
    // known season → preselect it in the dropdown; otherwise fall back to the free-text field
    this.seasonSelectValue.set(this.seasonChoices().includes(m.season) ? m.season : CUSTOM_SEASON);
    this.matchFormSubmitted.set(false);
    this.matchFieldErrors.set({});
    this.showMatchForm.set(true);
  }

  cancelMatchForm(): void {
    this.showMatchForm.set(false);
    this.matchForm = emptyMatchForm();
    this.seasonSelectValue.set('');
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
      ageGroup: this.ageGroupId,
      season: f.season.trim(),
      league: f.league,
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
        this.loadAllSeasons();
      },
      error: (err: HttpErrorResponse) => this.matchFieldErrors.set(this.extractFieldErrors(err)),
    });
  }

  // Maps express-validator's { path, msg }[] to a field → Arabic-message record for inline hints.
  // Whole-body checks (no path, e.g. the duplicate-fixture rule) are grouped under '_form'.
  private extractFieldErrors(err: HttpErrorResponse): Record<string, string> {
    const list: any[] = err.error?.errors;
    if (!Array.isArray(list)) return {};
    const map: Record<string, string> = {};
    for (const e of list) {
      const path: string = e.path || e.param || '_form';
      if (map[path]) continue; // keep the first message per field
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
      this.loadAllSeasons();
    });
  }
}
