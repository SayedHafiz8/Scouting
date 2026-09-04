import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SeasonMatch, SeasonMatchReport, SeasonMatchMedia, SeasonMatchStatus, SeasonMatchLeague, SeasonMatchFilters } from '../../../core/models/season-match.model';
import { Team } from '../../../core/models/team.model';
import { AgeGroup } from '../../../core/models/age-group.model';
import { Player } from '../../../core/models/player.model';
import { SeasonMatchService } from '../services/season-match.service';
import { PlayerService } from '../../players/services/player.service';
import { TeamService } from '../../teams/services/team.service';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

// Best-guess "current" season — the academic year starting this calendar year
function currentSeason(): string {
  const year = new Date().getFullYear();
  return `${year}/${year + 1}`;
}

interface ObservedPlayerRow {
  player: Player;
  teamName: string;
  nextMatch: SeasonMatch | null;
}

// Precomputed once per data change (in a computed()), not per change-detection pass —
// see CLAUDE.md's "no function calls inside a list loop in a template" rule. The
// underlying methods (isPastMatch, isAttending, teamName, …) stay as the single
// definition of each rule; only the template stops calling them per row per pass.
interface MatchRow {
  match: SeasonMatch;
  homeName: string;
  awayName: string;
  ageGroupLabel: string;
  isPast: boolean;
  isAttending: boolean;
  canEnterResult: boolean;
  canToggleAttend: boolean;
  attendeeCount: number;
}

interface ReportRow {
  id: string;
  playerId: string;
  playerName: string;
  overallRating: number;
}

interface MediaRow {
  id: string;
  type: 'image' | 'video';
  href: string | null;
  showLink: boolean;
  title: string;
  uploaderName: string;
  reviewStatus?: 'pending' | 'approved' | 'rejected' | null;
  reviewBadgeClass: string;
}

@Component({
  selector: 'app-my-matches',
  imports: [FormsModule, CommonModule, RouterLink, SkeletonLoaderComponent, EmptyStateComponent, TranslatePipe],
  template: `
    <div class="max-w-4xl mx-auto space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="page-title">{{ 'SEASON_MATCHES.SCHEDULE_TITLE' | translate }}</h2>
          <p class="page-subtitle">{{ 'SEASON_MATCHES.SCHEDULE_SUBTITLE' | translate }}</p>
        </div>
        @if (seasonOptions().length > 0) {
          <select [(ngModel)]="seasonFilter" (ngModelChange)="load()" class="form-input text-sm !w-auto">
            <option value="">{{ 'SEASON_MATCHES.ALL_SEASONS' | translate }}</option>
            @for (s of seasonOptions(); track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        }
      </div>

      <!-- League/age-group toggle. Hidden for proScout: the role only ever has one
           league in scope, so there is nothing to toggle (research.md R6).
           "الدوري الممتار" used to be one flat tab covering every age group; it's now
           one tab per age group that actually has a premier match registered — an
           age group with zero matches ever recorded gets no tab at all, so the list
           never lands on a silently-empty "premier, unfiltered" view. -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        @if (!auth.isProScout()) {
          <div class="inline-flex flex-wrap gap-1 p-1 rounded-xl" style="background:var(--bg-secondary)">
            @for (ag of premierAgeGroupTabs(); track ag._id) {
              <button type="button" (click)="selectAgeGroupTab(ag)"
                      class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      [class]="isAgeGroupTabActive(ag) ? 'bg-primary-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'">
                {{ ag.birthYear }}
              </button>
            }
            <button type="button" (click)="selectLeague('professional')"
                    class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    [class]="selectedLeague() === 'professional' ? 'bg-primary-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'">
              {{ 'SEASON_MATCHES.LEAGUE_PROFESSIONAL' | translate }}
            </button>
          </div>
        }
        @if (!auth.isAdmin()) {
          <label class="flex items-center gap-2 text-sm cursor-pointer" style="color:var(--text-secondary)">
            <input type="checkbox" [ngModel]="attendingOnly()" (ngModelChange)="attendingOnly.set($event)" class="rounded" />
            {{ 'SEASON_MATCHES.ATTENDING_ONLY' | translate }}
          </label>
        }
      </div>

      @if (loading()) {
        <app-skeleton-loader type="table-row" [count]="4" />
      } @else if (matchRows().length === 0) {
        <app-empty-state [title]="'SEASON_MATCHES.SCHEDULE_EMPTY' | translate" [message]="'SEASON_MATCHES.SCHEDULE_EMPTY_MSG' | translate" />
      } @else {
        <div class="card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead style="background:var(--bg-secondary)">
                <tr class="border-b" style="border-color:var(--border-color)">
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.MATCH_DATE' | translate }}</th>
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.FIXTURE' | translate }}</th>
                  @if (!auth.isProScout()) {
                    <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.AGE_GROUP' | translate }}</th>
                  }
                  <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.VENUE' | translate }}</th>
                  <th class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.ACTION' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of matchRows(); track row.match._id) {
                  <tr [class]="'border-b last:border-0' + (row.isPast ? ' cursor-pointer hover:opacity-80' : '')" style="border-color:var(--border-subtle)"
                      (click)="row.isPast && toggleMatchReports(row.match)">
                    <td class="px-4 py-3.5 whitespace-nowrap" style="color:var(--text-secondary)">{{ row.match.matchDate | date:'mediumDate' }}</td>
                    <td class="px-4 py-3.5 font-medium" style="color:var(--text-primary)">
                      {{ row.homeName }} <span style="color:var(--text-muted)">vs</span> {{ row.awayName }}
                      @if (row.match.status === 'completed' && row.match.result) {
                        <span class="ms-1.5 text-xs font-semibold" style="color:var(--text-muted)">({{ row.match.result.homeScore }}–{{ row.match.result.awayScore }})</span>
                      }
                      @if (row.isAttending) {
                        <span class="ms-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-green-500/90 text-white align-middle">{{ 'SEASON_MATCHES.ATTENDING' | translate }}</span>
                      }
                      @if (row.isPast) {
                        <svg class="inline-block w-3 h-3 ms-1.5 align-middle transition-transform" [class.rotate-180]="expandedMatchId() === row.match._id"
                             fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      }
                    </td>
                    @if (!auth.isProScout()) {
                      <td class="px-4 py-3.5" style="color:var(--text-secondary)">{{ row.ageGroupLabel }}</td>
                    }
                    <td class="px-4 py-3.5" style="color:var(--text-secondary)">{{ row.match.venue || '—' }}</td>
                    <td class="px-4 py-3.5 text-right" (click)="$event.stopPropagation()">
                      @if (row.canEnterResult) {
                        <button type="button" class="btn btn-ghost btn-sm inline-flex items-center gap-1.5" (click)="openResultForm(row.match)">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          {{ (row.match.status === 'completed' ? 'SEASON_MATCHES.EDIT_RESULT' : 'SEASON_MATCHES.ENTER_RESULT') | translate }}
                        </button>
                      } @else if (!auth.isAdmin() && row.match.status !== 'cancelled' && row.canToggleAttend) {
                        <button type="button" class="btn btn-sm" [disabled]="attendBusyId() === row.match._id"
                                [class]="row.isAttending ? 'btn-secondary' : 'btn-primary'" (click)="toggleAttend(row.match)">
                          {{ (row.isAttending ? 'SEASON_MATCHES.UNATTEND' : 'SEASON_MATCHES.ATTEND') | translate }}
                        </button>
                      } @else if (!auth.isAdmin() && row.match.status !== 'cancelled') {
                        <span class="text-xs" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.ATTENDANCE_LOCKED' | translate }}</span>
                      } @else if (auth.isAdmin()) {
                        <span class="text-xs inline-flex items-center gap-1" style="color:var(--text-muted)">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
                          {{ row.attendeeCount }}
                        </span>
                      } @else {
                        <span class="text-xs" style="color:var(--text-muted)">—</span>
                      }
                    </td>
                  </tr>
                  @if (resultMatchId() === row.match._id) {
                    <tr (click)="$event.stopPropagation()">
                      <td [attr.colspan]="columnCount()" class="px-4 py-4" style="background:var(--bg-secondary)">
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
                                <label class="block text-xs font-medium mb-1 truncate max-w-[140px]" style="color:var(--text-secondary)">{{ row.homeName }}</label>
                                <input [(ngModel)]="resultForm.homeScore" type="number" min="0" class="form-input text-sm" style="width:70px" />
                              </div>
                              <span class="pb-2.5 text-sm" style="color:var(--text-muted)">–</span>
                              <div>
                                <label class="block text-xs font-medium mb-1 truncate max-w-[140px]" style="color:var(--text-secondary)">{{ row.awayName }}</label>
                                <input [(ngModel)]="resultForm.awayScore" type="number" min="0" class="form-input text-sm" style="width:70px" />
                              </div>
                            </div>
                          }
                          <div class="flex gap-2">
                            <button type="button" class="btn btn-primary btn-sm" [disabled]="savingResult()" (click)="saveResult(row.match)">{{ 'COMMON.SAVE' | translate }}</button>
                            <button type="button" class="btn btn-secondary btn-sm" (click)="cancelResultForm()">{{ 'COMMON.CANCEL' | translate }}</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                  @if (expandedMatchId() === row.match._id) {
                    <tr>
                      <td [attr.colspan]="columnCount()" class="px-4 py-4" style="background:var(--bg-secondary)">
                        <div class="flex gap-1 mb-3" (click)="$event.stopPropagation()">
                          <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                  [class]="matchDetailTab() === 'reports' ? 'bg-primary-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'"
                                  (click)="matchDetailTab.set('reports')">
                            {{ 'SEASON_MATCHES.TABS.REPORTS' | translate }} ({{ matchReportRows().length }})
                          </button>
                          <button type="button" class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                  [class]="matchDetailTab() === 'media' ? 'bg-primary-500 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'"
                                  (click)="matchDetailTab.set('media')">
                            {{ 'SEASON_MATCHES.TABS.MEDIA' | translate }} ({{ matchMediaRows().length }})
                          </button>
                        </div>

                        @if (matchReportsLoading()) {
                          <app-skeleton-loader type="table-row" [count]="2" />
                        } @else if (matchDetailTab() === 'reports') {
                          @if (matchReportRows().length === 0) {
                            <p class="text-xs" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.NO_REPORTS' | translate }}</p>
                          } @else {
                            <ul class="space-y-1.5">
                              @for (r of matchReportRows(); track r.id) {
                                <li class="flex items-center justify-between text-sm">
                                  <a [routerLink]="['/players', r.playerId, 'reports', r.id]" class="font-medium hover:underline" style="color:var(--text-primary)" (click)="$event.stopPropagation()">
                                    {{ r.playerName }}
                                  </a>
                                  <span class="text-xs font-semibold" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.OVERALL_RATING' | translate }}: {{ r.overallRating }}</span>
                                </li>
                              }
                            </ul>
                          }
                        } @else {
                          @if (matchMediaRows().length === 0) {
                            <p class="text-xs" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.NO_MEDIA' | translate }}</p>
                          } @else {
                            <ul class="space-y-1.5">
                              @for (item of matchMediaRows(); track item.id) {
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
                                    @if (item.showLink) {
                                      <a [href]="item.href" target="_blank" rel="noopener" class="font-medium hover:underline truncate" style="color:var(--text-primary)" (click)="$event.stopPropagation()">
                                        {{ item.title }}
                                      </a>
                                    } @else {
                                      <span class="font-medium truncate" style="color:var(--text-primary)">{{ item.title }}</span>
                                    }
                                    <span class="text-xs flex-shrink-0" style="color:var(--text-muted)">— {{ item.uploaderName }}</span>
                                  </div>
                                  @if (item.reviewStatus) {
                                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" [class]="item.reviewBadgeClass">
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
        </div>
      }

      <!-- Observer secondary view — the next scheduled match for each observed player's team -->
      @if (auth.isObserver()) {
        <div class="card overflow-hidden">
          <button type="button" class="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold" style="color:var(--text-primary)" (click)="observedOpen.set(!observedOpen())">
            <span>{{ 'SEASON_MATCHES.OBSERVED_PLAYERS' | translate }}</span>
            <svg class="w-4 h-4 transition-transform" [class.rotate-180]="observedOpen()" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          @if (observedOpen()) {
            @if (observedLoading()) {
              <app-skeleton-loader type="table-row" [count]="3" />
            } @else if (observedRows().length === 0) {
              <p class="px-4 py-4 text-sm" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.OBSERVER_EMPTY_MSG' | translate }}</p>
            } @else {
              <div class="overflow-x-auto border-t" style="border-color:var(--border-color)">
                <table class="w-full text-sm">
                  <thead style="background:var(--bg-secondary)">
                    <tr class="border-b" style="border-color:var(--border-color)">
                      <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.PLAYER' | translate }}</th>
                      <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.TEAM' | translate }}</th>
                      <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.NEXT_MATCH' | translate }}</th>
                      <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'SEASON_MATCHES.MATCH_DATE' | translate }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of observedRows(); track row.player._id) {
                      <tr class="border-b last:border-0" style="border-color:var(--border-subtle)">
                        <td class="px-4 py-3.5 font-medium" style="color:var(--text-primary)">{{ row.player.name }}</td>
                        <td class="px-4 py-3.5" style="color:var(--text-secondary)">{{ row.teamName || '—' }}</td>
                        @if (row.nextMatch) {
                          <td class="px-4 py-3.5" style="color:var(--text-primary)">
                            {{ teamName(row.nextMatch.homeTeam) }} <span style="color:var(--text-muted)">vs</span> {{ teamName(row.nextMatch.awayTeam) }}
                          </td>
                          <td class="px-4 py-3.5 whitespace-nowrap" style="color:var(--text-secondary)">{{ row.nextMatch.matchDate | date:'mediumDate' }}</td>
                        } @else {
                          <td class="px-4 py-3.5 text-xs" style="color:var(--text-muted)" colspan="2">{{ 'SEASON_MATCHES.NO_UPCOMING_MATCH' | translate }}</td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        </div>
      }
    </div>
  `
})
export class MyMatchesComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly seasonMatchService = inject(SeasonMatchService);
  private readonly playerService = inject(PlayerService);
  private readonly teamService = inject(TeamService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  // proScout has exactly one league in scope — default straight to it instead of 'premier',
  // which the scope layer's $and wrap would silently return zero rows for (research.md R6).
  readonly selectedLeague = signal<SeasonMatchLeague>(this.auth.isProScout() ? 'professional' : 'premier');
  // The premier tab set is now per-age-group, not a single flat tab — see
  // loadAllSeasons(), which derives this from the same unfiltered fetch it already
  // makes for the season dropdown (no extra request). null until that resolves.
  readonly premierAgeGroupTabs = signal<AgeGroup[]>([]);
  readonly selectedAgeGroupId = signal<string | null>(null);
  readonly attendingOnly = signal(false);

  readonly loading = signal(true);
  readonly matches = signal<SeasonMatch[]>([]);
  readonly allSeasons = signal<string[]>([]);
  readonly expandedMatchId = signal<string | null>(null);
  readonly matchReports = signal<SeasonMatchReport[]>([]);
  readonly matchMedia = signal<SeasonMatchMedia[]>([]);
  readonly matchReportsLoading = signal(false);
  readonly matchDetailTab = signal<'reports' | 'media'>('reports');
  readonly attendBusyId = signal<string | null>(null);
  seasonFilter = currentSeason();

  // Observer secondary view — one row per observed player, showing the next scheduled match for their team
  readonly observedOpen = signal(false);
  readonly observedLoading = signal(true);
  readonly observedRows = signal<ObservedPlayerRow[]>([]);

  // Result entry — any attendee (coach or observer) can report the result of a match they attended, once it's happened
  readonly resultMatchId = signal<string | null>(null);
  readonly savingResult = signal(false);
  resultForm: { status: SeasonMatchStatus; homeScore: number; awayScore: number } = { status: 'completed', homeScore: 0, awayScore: 0 };

  readonly seasonOptions = computed(() => {
    const set = new Set([...this.allSeasons(), currentSeason()]);
    return Array.from(set).sort().reverse();
  });

  // Table column count for expandable rows' colspan — one fewer for proScout,
  // which has no age-group column (FR-002).
  readonly columnCount = computed(() => this.auth.isProScout() ? 4 : 5);

  // الأوبزيرفر بقى يشوف الجدول كامل زي الكوتش/الأدمن بالظبط (observer-matches-and-players) —
  // القيد القديم اللي كان بيقصره على ماتشات حضرها + ماتش قادم واحد لكل لاعب متابَع اتلغى، لأنه كان
  // انعكاس فرونت إند لقيد سيرفر اتلغى هو نفسه في seasonMatchController (Stage 1). لوحة
  // "اللاعبين اللي بتابعهم" (observedRows) فضلت زي ما هي — مش جزء من الفلترة هنا.
  readonly visibleMatches = computed(() => {
    let list = this.matches();
    if (this.attendingOnly()) {
      list = list.filter(m => this.isAttending(m));
    }
    return list;
  });

  // Precomputed row view-models — see the MatchRow comment above. The template's
  // @for iterates this, not visibleMatches() directly.
  readonly matchRows = computed<MatchRow[]>(() => this.visibleMatches().map(m => this.toRow(m)));

  readonly matchReportRows = computed<ReportRow[]>(() =>
    this.matchReports().map(r => ({
      id: r._id,
      playerId: this.reportPlayerId(r),
      playerName: this.reportPlayerName(r),
      overallRating: r.overallRating,
    }))
  );

  readonly matchMediaRows = computed<MediaRow[]>(() =>
    this.matchMedia().map(item => ({
      id: item._id,
      type: item.type,
      href: item.embedUrl || item.url,
      showLink: item.type !== 'video' || this.auth.isAdmin(),
      title: item.title || this.mediaPlayerName(item),
      uploaderName: this.mediaUploaderName(item),
      reviewStatus: item.reviewStatus,
      reviewBadgeClass: item.reviewStatus ? this.reviewBadgeClass(item.reviewStatus) : '',
    }))
  );

  ngOnInit(): void {
    // The default view for a non-proScout is a premier age-group tab, but which
    // tab is only known once loadAllSeasons() below resolves premierAgeGroupTabs()
    // — it calls load() itself the moment it picks the first tab. Loading now and
    // firing an immediate, ageGroup-less load() here would flash "every premier
    // match" before snapping to the real default; skip the redundant first call.
    if (this.selectedLeague() === 'premier' && !this.auth.isProScout()) {
      this.loading.set(true);
    } else {
      this.load();
    }
    this.loadAllSeasons();
    if (this.auth.isObserver()) {
      this.loadObservedRows();
    }
  }

  private get currentUserId(): string {
    return this.auth.currentUser()?._id ?? '';
  }

  selectLeague(league: SeasonMatchLeague): void {
    if (this.selectedLeague() === league && (league !== 'premier' || !this.selectedAgeGroupId())) return;
    this.selectedLeague.set(league);
    if (league === 'professional') this.selectedAgeGroupId.set(null);
    this.expandedMatchId.set(null);
    this.resultMatchId.set(null);
    this.load();
  }

  selectAgeGroupTab(ag: AgeGroup): void {
    if (this.selectedLeague() === 'premier' && this.selectedAgeGroupId() === ag._id) return;
    this.selectedLeague.set('premier');
    this.selectedAgeGroupId.set(ag._id);
    this.expandedMatchId.set(null);
    this.resultMatchId.set(null);
    this.load();
  }

  isAgeGroupTabActive(ag: AgeGroup): boolean {
    return this.selectedLeague() === 'premier' && this.selectedAgeGroupId() === ag._id;
  }

  load(): void {
    this.loading.set(true);
    const filters: SeasonMatchFilters = { league: this.selectedLeague(), season: this.seasonFilter || undefined, sort: 'matchDate' };
    if (this.selectedLeague() === 'premier' && this.selectedAgeGroupId()) {
      filters.ageGroup = this.selectedAgeGroupId()!;
    }
    this.seasonMatchService.getAll(filters).subscribe({
      next: (res) => {
        this.matches.set(res.data?.documents ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // Unfiltered (capped at the API's own MAX_LIMIT=200), so the season dropdown
  // always lists every season on the schedule. Reused for a second purpose now:
  // deriving which age groups actually have a premier match registered at all,
  // from the same round trip — a fixture's populated `ageGroup` (see
  // seasonMatchModel.js's pre-find populate) is enough, no extra request per group.
  private loadAllSeasons(): void {
    this.seasonMatchService.getAll({ limit: 200 }).subscribe(res => {
      const docs = res.data?.documents ?? [];
      this.allSeasons.set(Array.from(new Set(docs.map(m => m.season))));

      if (this.auth.isProScout()) return;

      const byId = new Map<string, AgeGroup>();
      docs.forEach(m => {
        if (m.league !== 'premier' || !m.ageGroup || typeof m.ageGroup === 'string') return;
        byId.set(m.ageGroup._id, m.ageGroup);
      });
      const tabs = Array.from(byId.values()).sort((a, b) => a.birthYear - b.birthYear);
      this.premierAgeGroupTabs.set(tabs);

      // First resolution of the default view: land on the earliest tab with data
      // instead of the ageGroup-less "every premier match" the server would
      // otherwise return for a bare league=premier query.
      if (this.selectedLeague() === 'premier' && !this.selectedAgeGroupId()) {
        const first = tabs[0];
        if (first) this.selectedAgeGroupId.set(first._id);
        this.load();
      }
    });
  }

  attendeeIds(m: SeasonMatch): string[] {
    return (m.attendees ?? []).map(a => (typeof a === 'string' ? a : a._id));
  }

  isAttending(m: SeasonMatch): boolean {
    if (this.auth.isAdmin()) return false;
    return this.attendeeIds(m).includes(this.currentUserId);
  }

  canEnterResult(m: SeasonMatch): boolean {
    if (this.auth.isAdmin()) return this.isPastMatch(m);
    // الكشاف/الأوبزيرفر لازم يكون حاضر المباراة ويسجل نتيجتها يوم المباراة نفسه بس
    return this.isMatchDay(m) && this.isAttending(m);
  }

  private toRow(m: SeasonMatch): MatchRow {
    return {
      match: m,
      homeName: this.teamName(m.homeTeam),
      awayName: this.teamName(m.awayTeam),
      ageGroupLabel: this.ageGroupName(m.ageGroup),
      isPast: this.isPastMatch(m),
      isAttending: this.isAttending(m),
      canEnterResult: this.canEnterResult(m),
      canToggleAttend: this.canToggleAttend(m),
      attendeeCount: this.attendeeIds(m).length,
    };
  }

  toggleAttend(m: SeasonMatch): void {
    const op = this.isAttending(m)
      ? this.seasonMatchService.unattend(m._id)
      : this.seasonMatchService.attend(m._id);
    this.attendBusyId.set(m._id);
    op.subscribe({
      next: (res) => {
        const updated = res.data?.document;
        if (updated) this.matches.update(list => list.map(x => x._id === updated._id ? updated : x));
        this.attendBusyId.set(null);
      },
      error: () => this.attendBusyId.set(null),
    });
  }

  private loadObservedRows(): void {
    this.observedLoading.set(true);
    this.playerService.getAll({ status: 'observed', limit: 100 }).subscribe({
      next: (res) => {
        const players = res.data?.documents ?? [];
        if (players.length === 0) {
          this.observedRows.set([]);
          this.observedLoading.set(false);
          return;
        }

        const teamIds = new Set(
          players.map(p => this.teamId(p.team ?? null)).filter(id => id)
        );

        // فريق اللاعب ممكن يكون تابع لفئة عمرية مختلفة عن فئة اللاعب نفسه (اللي بتتحسب من تاريخ الميلاد)،
        // فلازم نجيب الـ ageGroup/league الحقيقيين بتوع الفريق مش فئة اللاعب عشان نلاقي الماتش الصح
        Promise.all(
          Array.from(teamIds).map(id => firstValueFrom(this.teamService.getOne(id)).then(res => res?.data?.document ?? null))
        ).then(teamDocs => {
          const teamById = new Map<string, Team>();
          teamDocs.forEach(t => { if (t) teamById.set(t._id, t); });

          // الماتش يفضل ظاهر كـ"الماتش القادم" لحد آخر اليوم اللي بعده — عشان ميختفيش فورًا
          // لما الوقت يعدي، لو حالة اللاعب لسه "observed" ومتغيرتش. بعد كده بيظهر الماتش
          // القادم الحقيقي بس.
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 1);
          cutoff.setHours(0, 0, 0, 0);
          const cutoffIso = cutoff.toISOString();
          const groupKeys = new Set(
            Array.from(teamById.values()).map(t => `${this.teamId(t.ageGroup as any)}::${t.league}`)
          );

          const matchesByGroup = new Map<string, SeasonMatch[]>();
          Promise.all(
            Array.from(groupKeys).map(key => {
              const [ageGroupId, league] = key.split('::');
              return firstValueFrom(
                this.seasonMatchService.getAll({ ageGroup: ageGroupId, league: league as SeasonMatchLeague, sort: 'matchDate', 'matchDate[gte]': cutoffIso })
              ).then(res => matchesByGroup.set(key, res?.data?.documents ?? []));
            })
          ).then(() => {
            const rows: ObservedPlayerRow[] = players.map(player => {
              const teamId = this.teamId(player.team ?? null);
              const team = teamId ? teamById.get(teamId) : null;
              const upcoming = team ? (matchesByGroup.get(`${this.teamId(team.ageGroup as any)}::${team.league}`) ?? []) : [];
              const nextMatch = teamId
                ? upcoming.find(m => this.teamId(m.homeTeam) === teamId || this.teamId(m.awayTeam) === teamId) ?? null
                : null;
              return { player, teamName: team?.name ?? '', nextMatch };
            });
            this.observedRows.set(rows);
            this.observedLoading.set(false);
          });
        });
      },
      error: () => this.observedLoading.set(false),
    });
  }

  private teamId(team: Team | string | null): string {
    if (!team) return '';
    return typeof team === 'string' ? team : team._id;
  }

  teamName(team: Team | string): string {
    return typeof team === 'string' ? team : team.name;
  }

  ageGroupName(ageGroup: AgeGroup | string | undefined): string {
    if (!ageGroup) return '—'; // professional-league fixtures carry no ageGroup (Stage 13)
    return typeof ageGroup === 'string' ? ageGroup : ageGroup.name;
  }

  isPastMatch(m: SeasonMatch): boolean {
    return new Date(m.matchDate).getTime() < Date.now();
  }

  // نتيجة المباراة بتتسجل يوم المباراة نفسه بس — نفس قاعدة الباك اند فى updateMatchStatus
  isMatchDay(m: SeasonMatch): boolean {
    const dayStart = new Date(m.matchDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const now = Date.now();
    return now >= dayStart.getTime() && now < dayEnd.getTime();
  }

  // الحضور/الإلغاء متاح لحد آخر اليوم اللي قبل يوم الماتش بس — نفس قاعدة الباك اند
  canToggleAttend(m: SeasonMatch): boolean {
    const dayStart = new Date(m.matchDate);
    dayStart.setHours(0, 0, 0, 0);
    return Date.now() < dayStart.getTime();
  }

  openResultForm(m: SeasonMatch): void {
    this.resultMatchId.set(m._id);
    this.resultForm = {
      status: m.status === 'scheduled' ? 'completed' : m.status,
      homeScore: m.result?.homeScore ?? 0,
      awayScore: m.result?.awayScore ?? 0,
    };
  }

  cancelResultForm(): void {
    this.resultMatchId.set(null);
  }

  saveResult(m: SeasonMatch): void {
    this.savingResult.set(true);
    const payload = this.resultForm.status === 'completed'
      ? { status: this.resultForm.status, result: { homeScore: this.resultForm.homeScore, awayScore: this.resultForm.awayScore } }
      : { status: this.resultForm.status };

    this.seasonMatchService.updateStatus(m._id, payload).subscribe({
      next: (res) => {
        const updated = res.data?.document;
        if (updated) this.matches.update(list => list.map(x => x._id === updated._id ? updated : x));
        this.toast.success(this.translate.instant('SEASON_MATCHES.RESULT_SAVED'));
        this.savingResult.set(false);
        this.resultMatchId.set(null);
      },
      error: () => this.savingResult.set(false),
    });
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

  mediaPlayerName(m: SeasonMatchMedia): string {
    return typeof m.player === 'string' ? m.player : (m.player as Player).name;
  }

  mediaUploaderName(m: SeasonMatchMedia): string {
    return typeof m.uploadedBy === 'string' ? m.uploadedBy : m.uploadedBy.name;
  }

  reviewBadgeClass(status: string): string {
    if (status === 'approved') return 'bg-green-500/90 text-white';
    if (status === 'rejected') return 'bg-rose-500/90 text-white';
    return 'bg-amber-500/90 text-white';
  }
}
