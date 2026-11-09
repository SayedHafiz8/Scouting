import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, map, of, shareReplay } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ScoutingReportService } from '../services/scouting-report.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { RadarChartComponent } from '../../../shared/components/radar-chart/radar-chart.component';
import { PlayerService } from '../../players/services/player.service';
import { SeasonMatchService } from '../../season-matches/services/season-match.service';
import { SeasonMatch } from '../../../core/models/season-match.model';
import { TeamService } from '../../teams/services/team.service';
import { Team } from '../../../core/models/team.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { AgeGroup } from '../../../core/models/age-group.model';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { PlayerContextService } from '../../../core/services/player-context.service';

interface RatingField { key: string; label: string; }

// طلب مالك 2026-09 — استبدال كامل لمجموعة الفيلدز (راجع Backend/models/scoutingReportModel.js
// لتفاصيل القرار والتسميات المقابلة بالعربي).
const ratingColorOf = (value: number | null | undefined): string =>
  !value ? 'var(--text-muted)' : value >= 8 ? '#22c55e' : value >= 5 ? '#f59e0b' : '#f43f5e';

const TECHNICAL_FIELDS: RatingField[] = [
  { key: 'turning', label: 'REPORTS.FORM.TURNING' },
  { key: 'dribbling', label: 'REPORTS.FORM.DRIBBLING' },
  { key: 'tackling', label: 'REPORTS.FORM.TACKLING' },
  { key: 'twoFooted', label: 'REPORTS.FORM.TWO_FOOTED' },
  { key: 'longPassing', label: 'REPORTS.FORM.LONG_PASSING' },
  { key: 'shortPassing', label: 'REPORTS.FORM.SHORT_PASSING' },
  { key: 'heading', label: 'REPORTS.FORM.HEADING' },
];

const PHYSICAL_FIELDS: RatingField[] = [
  { key: 'shortSprints', label: 'REPORTS.FORM.SHORT_SPRINTS' },
  { key: 'longSprints', label: 'REPORTS.FORM.LONG_SPRINTS' },
  { key: 'agility', label: 'REPORTS.FORM.AGILITY' },
  { key: 'aerialDuels', label: 'REPORTS.FORM.AERIAL_DUELS' },
  { key: 'groundDuels', label: 'REPORTS.FORM.GROUND_DUELS' },
];

const MENTAL_FIELDS: RatingField[] = [
  { key: 'vision', label: 'REPORTS.FORM.VISION' },
  { key: 'personality', label: 'REPORTS.FORM.PERSONALITY' },
  { key: 'movement', label: 'REPORTS.FORM.MOVEMENT' },
];

@Component({
    selector: 'app-report-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule, FormsModule, RouterLink, RadarChartComponent, SkeletonLoaderComponent, TranslatePipe],
    styles: [`
      /* ── Rating pip buttons ──────────────────── */
      .pip {
        width: 28px; height: 28px; border-radius: 7px;
        font-size: 11px; font-weight: 700; line-height: 1;
        border: 1.5px solid var(--border-color);
        background: transparent; color: var(--text-muted);
        cursor: pointer; transition: all 0.1s ease; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
      }
      .pip:hover { transform: scale(1.15); z-index: 1; }

      /* Technical = green */
      .pip-t.pip-on { background: rgba(34,197,94,0.18); border-color: #22c55e; color: #22c55e; }
      .pip-t:hover  { border-color: #22c55e; color: #22c55e; }

      /* Physical = sky */
      .pip-p.pip-on { background: rgba(56,189,248,0.18); border-color: #38bdf8; color: #38bdf8; }
      .pip-p:hover  { border-color: #38bdf8; color: #38bdf8; }

      /* Mental = purple */
      .pip-m.pip-on { background: rgba(139,92,246,0.18); border-color: #8b5cf6; color: #8b5cf6; }
      .pip-m:hover  { border-color: #8b5cf6; color: #8b5cf6; }

      /* Category section header */
      .cat-header {
        display: flex; align-items: center; gap: 10px; margin-bottom: 18px;
        padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle);
      }
      .cat-icon {
        width: 34px; height: 34px; border-radius: 9px;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }

      /* Sidebar overall ring */
      .overall-ring {
        width: 88px; height: 88px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        border: 4px solid; transition: border-color 0.3s, color 0.3s;
        margin: 0 auto;
      }

      /* Category mini bar */
      .cat-bar-fill { height: 6px; border-radius: 9999px; transition: width 0.4s ease; }
    `],
    template: `
    <div class="max-w-4xl mx-auto space-y-5">

      <!-- ── Breadcrumb ── -->
      <nav class="flex items-center gap-2 text-sm" style="color:var(--text-muted)">
        <a [routerLink]="['/players', playerId, 'reports']"
           class="flex items-center gap-1.5 hover:opacity-80 transition-opacity" style="color:var(--accent)">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          {{ 'REPORTS.FORM.REPORTS_LINK' | translate }}
        </a>
        <svg class="w-3.5 h-3.5 opacity-40" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style="color:var(--text-primary);font-weight:600">
          {{ 'REPORTS.FORM.NEW' | translate }}
        </span>
      </nav>

      <form [formGroup]="form" (ngSubmit)="submit()">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

          <!-- ══ LEFT: form panels ══ -->
          <div class="lg:col-span-2 space-y-4">

            <!-- Match info -->
            <div class="card p-5">
              <div class="cat-header">
                <div class="cat-icon" style="background:rgba(34,197,94,0.12)">
                  <svg style="width:17px;height:17px;color:#22c55e" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div class="flex-1">
                  <h3 class="text-sm font-bold" style="color:var(--text-primary)">{{ 'REPORTS.FORM.MATCH_INFO' | translate }}</h3>
                  <p class="text-xs" style="color:var(--text-muted)">{{ 'REPORTS.FORM.MATCH_TEAMS_HINT' | translate }}</p>
                </div>
                <!-- Read-only report date badge -->
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style="background:rgba(148,163,184,0.1)">
                  <svg style="width:13px;height:13px;color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span class="text-xs font-semibold tabular-nums" style="color:var(--text-secondary)">{{ reportDate() }}</span>
                </div>
              </div>

              <!-- admin-assign-players-reports-media — admin-only, create-only. Populated
                   from the player's own observers[] (already loaded with the player, no
                   extra request) — matches the server's requirement that assignedObserver
                   must already be assigned to this player. -->
              @if (auth.isAdmin() && (playerObservers().length > 0 || playerProScout())) {
                <div class="space-y-1.5 mb-2">
                  <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                    {{ 'REPORTS.FORM.FILE_ON_BEHALF_OF' | translate }}
                  </label>
                  <select [ngModel]="assignedObserver()" (ngModelChange)="assignedObserver.set($event)"
                          [ngModelOptions]="{standalone: true}" class="form-input">
                    <option value="">{{ 'REPORTS.FORM.FILE_ON_BEHALF_OF_SELF' | translate }}</option>
                    @if (playerProScout(); as ps) {
                      <option [value]="ps._id">{{ ps.name }} — {{ 'PLAYERS.DETAIL.PROSCOUT' | translate }}</option>
                    }
                    @for (o of playerObservers(); track o._id) {
                      <option [value]="o._id">{{ o.name }}</option>
                    }
                  </select>
                </div>
              }

              <!-- ⚠️ القسم كله مخفي لحد ما البيانات اللي بتحدد شكله توصل.
                   من غير البوابة دي، أول رسمة بتطلع بفرع "مضيف × ضيف" (لأن
                   hasTeam() ابتدائيًا false) وبعدين الشكل بيتغيّر مع كل رد. -->
              @if (!matchInputsReady()) {
                <app-skeleton-loader [count]="2" />
              } @else {

              @if (showLinkedMatch()) {
                <!-- مباراة فريقه في الجدول النهاردة أو امبارح — بتترتبط تلقائي،
                     مفيش اختيار. (طلب مالك 2026-09: قايمة "ربط بمباراة" اتشالت) -->
                <div class="space-y-1.5 mb-2">
                  <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                    {{ 'REPORTS.FORM.SEASON_MATCH' | translate }}
                  </label>
                  <div class="form-input flex items-center gap-2"
                       style="cursor:default;background:rgba(148,163,184,0.08)">
                    <svg style="width:14px;height:14px;color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span class="font-semibold" style="color:var(--text-secondary)">{{ linkedMatchLabel() }}</span>
                  </div>
                  <p class="text-[11px]" style="color:var(--text-muted)">{{ 'REPORTS.FORM.AUTO_LINKED_HINT' | translate }}</p>
                </div>
              }

              @if (showFixturePicker()) {
                <!-- المحترف وحده: مبارياته قليلة ومتباعدة وبيكتب تقريره وقت ما يقدر،
                     فبيختار من كل مباريات ناديه اللي اتلعبت. -->
                <div class="space-y-1.5 mb-2">
                  <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                    {{ 'REPORTS.FORM.SEASON_MATCH' | translate }}
                  </label>
                  <select [ngModel]="selectedSeasonMatch()" (ngModelChange)="onSeasonMatchChange($event)"
                          [ngModelOptions]="{standalone: true}" class="form-input">
                    <option value="">{{ 'REPORTS.FORM.NO_SEASON_MATCH' | translate }}</option>
                    @for (m of seasonMatchOptions(); track m._id) {
                      <option [value]="m._id">{{ matchOptionLabel(m) }}</option>
                    }
                  </select>
                  <p class="text-[11px]" style="color:var(--text-muted)">{{ 'REPORTS.FORM.SEASON_MATCH_HINT' | translate }}</p>
                </div>
              }

              @if (showOpponentPicker()) {
                <!-- مفيش مباراة من الجدول — فريق اللاعب ثابت (من السيرفر)، والكشاف
                     بيحدد الفئة اللي لعب معاها النهاردة (ممكن تكون أكبر من فئته)
                     والفريق المنافس. مفيش مضيف/ضيف هنا (طلب مالك 2026-09). -->
                <div class="space-y-2.5">
                  @if (playerTeamName()) {
                    <div class="space-y-1.5">
                      <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                        {{ 'REPORTS.FORM.PLAYER_TEAM' | translate }}
                      </label>
                      <div class="form-input flex items-center gap-2"
                           style="cursor:default;background:rgba(148,163,184,0.08)">
                        <svg style="width:14px;height:14px;color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        <span class="font-semibold" style="color:var(--text-secondary)">{{ playerTeamName() }}</span>
                      </div>
                    </div>
                  }

                  @if (showAgeGroupPicker()) {
                    <div class="space-y-1.5">
                      <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                        {{ 'REPORTS.FORM.PLAYED_WITH' | translate }}
                      </label>
                      <select [ngModel]="playedWithAgeGroup()" (ngModelChange)="onPlayedWithChange($event)"
                              [ngModelOptions]="{standalone: true}" class="form-input">
                        <option value="">{{ 'REPORTS.FORM.SELECT_AGE_GROUP' | translate }}</option>
                        @for (g of ageGroupOptions(); track g._id) {
                          <option [value]="g._id">{{ g.name }}</option>
                        }
                      </select>
                      <p class="text-[11px]" style="color:var(--text-muted)">{{ 'REPORTS.FORM.PLAYED_WITH_HINT' | translate }}</p>
                      @if (submitted() && !playedWithAgeGroup()) {
                        <p class="field-error">{{ 'REPORTS.FORM.PLAYED_WITH_ERR' | translate }}</p>
                      }
                    </div>
                  }

                  @if (ageGroupMatchOptions().length > 0) {
                    <!-- فريق نفس النادي في الفئة دي عنده مباراة في الجدول النهاردة/امبارح —
                         التقرير بيترتبط بيها والمنافس والتاريخ بييجوا منها -->
                    <div class="space-y-1.5 pt-1">
                      <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                        {{ 'REPORTS.FORM.AGE_GROUP_MATCH' | translate }}
                      </label>
                      <select [ngModel]="selectedAgeGroupMatch()" (ngModelChange)="onAgeGroupMatchChange($event)"
                              [ngModelOptions]="{standalone: true}" class="form-input">
                        <option value="">{{ 'REPORTS.FORM.NO_SEASON_MATCH' | translate }}</option>
                        @for (m of ageGroupMatchOptions(); track m._id) {
                          <option [value]="m._id">{{ m.label }}</option>
                        }
                      </select>
                      <p class="text-[11px]" style="color:var(--text-muted)">
                        {{ 'REPORTS.FORM.AGE_GROUP_MATCH_HINT' | translate }}
                      </p>
                    </div>
                  }

                  @if ((!showAgeGroupPicker() || playedWithAgeGroup()) && !selectedAgeGroupMatch()) {
                    <div class="space-y-1.5 pt-1">
                      <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                        {{ 'REPORTS.FORM.OPPONENT_TEAM' | translate }}
                      </label>
                      @if (opponentOptions().length > 0) {
                        <!-- تبديل الفئة بيبهّت الحقل ويقفله لحد ما القايمة الجديدة
                             توصل — قبل كده كان بيختفي ويرجع، فالقسم كان بينط -->
                        <select [ngModel]="awayIsOther() ? OTHER_TEAM : form.get('awayTeam')?.value"
                                (ngModelChange)="onTeamSelectChange('away', $event)"
                                [disabled]="ageGroupInputsLoading()"
                                [style.opacity]="ageGroupInputsLoading() ? '0.55' : null"
                                [ngModelOptions]="{standalone: true}" class="form-input">
                          <option value="">{{ 'REPORTS.FORM.SELECT_TEAM' | translate }}</option>
                          @for (t of opponentOptions(); track t._id) {
                            <option [value]="t._id">{{ t.name }}</option>
                          }
                          <option [value]="OTHER_TEAM">{{ 'REPORTS.FORM.TEAM_NOT_LISTED' | translate }}</option>
                        </select>
                      } @else if (opponentOptionsLoaded()) {
                        <!-- الفئة دي مالهاش فرق مسجلة — الاسم بيتكتب يدوي -->
                        <p class="text-[11px]" style="color:var(--text-muted)">{{ 'REPORTS.FORM.NO_TEAMS_IN_AGE_GROUP' | translate }}</p>
                      }
                      @if (awayIsOther() || (opponentOptionsLoaded() && opponentOptions().length === 0)) {
                        <input type="text" formControlName="awayTeamName" class="form-input"
                               [placeholder]="'REPORTS.FORM.TEAM_NAME_PH' | translate" />
                      }
                      @if (submitted() && !awayTeam() && !form.get('awayTeamName')?.value) {
                        <p class="field-error">{{ 'REPORTS.FORM.TEAMS_ERR' | translate }}</p>
                      }
                    </div>
                  }
                </div>
              }

              @if (!hasTeam()) {
                <!-- اللاعب مش متسجل في أي فريق — مفيش جدول مباريات نربطه بيه، فالإدخال يدوي (اختيار أو كتابة اسم) -->
                <div class="flex items-end gap-3">
                  <div class="flex-1 space-y-1.5">
                    <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                      {{ 'REPORTS.FORM.HOME_TEAM' | translate }}
                    </label>
                    <select [ngModel]="homeIsOther() ? OTHER_TEAM : form.get('homeTeam')?.value"
                            (ngModelChange)="onTeamSelectChange('home', $event)"
                            [ngModelOptions]="{standalone: true}" class="form-input">
                      <option value="">{{ 'REPORTS.FORM.SELECT_TEAM' | translate }}</option>
                      @for (t of teamOptions(); track t._id) {
                        <option [value]="t._id">{{ t.name }}</option>
                      }
                      <option [value]="OTHER_TEAM">{{ 'REPORTS.FORM.TEAM_NOT_LISTED' | translate }}</option>
                    </select>
                    @if (homeIsOther()) {
                      <input type="text" formControlName="homeTeamName" class="form-input"
                             [placeholder]="'REPORTS.FORM.TEAM_NAME_PH' | translate" />
                    }
                  </div>

                  <div class="flex items-center justify-center font-black text-xs shrink-0"
                       style="width:34px;height:42px;color:var(--text-muted)">VS</div>

                  <div class="flex-1 space-y-1.5">
                    <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                      {{ 'REPORTS.FORM.AWAY_TEAM' | translate }}
                    </label>
                    <select [ngModel]="awayIsOther() ? OTHER_TEAM : form.get('awayTeam')?.value"
                            (ngModelChange)="onTeamSelectChange('away', $event)"
                            [ngModelOptions]="{standalone: true}" class="form-input">
                      <option value="">{{ 'REPORTS.FORM.SELECT_TEAM' | translate }}</option>
                      @for (t of teamOptions(); track t._id) {
                        <option [value]="t._id">{{ t.name }}</option>
                      }
                      <option [value]="OTHER_TEAM">{{ 'REPORTS.FORM.TEAM_NOT_LISTED' | translate }}</option>
                    </select>
                    @if (awayIsOther()) {
                      <input type="text" formControlName="awayTeamName" class="form-input"
                             [placeholder]="'REPORTS.FORM.TEAM_NAME_PH' | translate" />
                    }
                  </div>
                </div>
                @if (teamOptionsLoaded() && teamOptions().length === 0) {
                  <p class="text-xs mt-1.5" style="color:var(--text-muted)">{{ 'REPORTS.FORM.NO_TEAMS_AVAILABLE' | translate }}</p>
                }
                @if (submitted() && !homeIsOther() && !form.get('homeTeam')?.value || submitted() && !awayIsOther() && !form.get('awayTeam')?.value) {
                  <p class="field-error mt-1.5">{{ 'REPORTS.FORM.TEAMS_ERR' | translate }}</p>
                }
              }

              }
            </div>

            <!-- ── Technical ── -->
            <div class="card p-5" style="border-top:3px solid #22c55e">
              <div class="cat-header">
                <div class="cat-icon" style="background:rgba(34,197,94,0.12)">
                  <svg style="width:17px;height:17px;color:#22c55e" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4l3 3"/>
                  </svg>
                </div>
                <div class="flex-1">
                  <h3 class="text-sm font-bold" style="color:#22c55e">{{ 'REPORTS.FORM.TECHNICAL' | translate }}</h3>
                  <p class="text-xs" style="color:var(--text-muted)">{{ technicalFields.length }} {{ 'REPORTS.FORM.METRICS' | translate }}</p>
                </div>
                <span class="text-xl font-black tabular-nums" [style.color]="categoryColors().technical">
                  {{ categoryAverages().technical || '—' }}
                </span>
              </div>
              <div class="space-y-5" formGroupName="technical">
                @for (field of ratingRows().technical; track field.key) {
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold" style="color:var(--text-secondary)">{{ field.label | translate }}</span>
                      <span class="text-sm font-black tabular-nums w-6 text-center" [style.color]="field.color">
                        {{ field.value }}
                      </span>
                    </div>
                    <div class="flex gap-1">
                      @for (n of pipRange; track n) {
                        <button type="button" class="pip pip-t flex-1"
                                [class.pip-on]="n <= field.value"
                                (click)="setRating(field.path, n)">{{ n }}</button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- ── Physical ── -->
            <div class="card p-5" style="border-top:3px solid #38bdf8">
              <div class="cat-header">
                <div class="cat-icon" style="background:rgba(56,189,248,0.12)">
                  <svg style="width:17px;height:17px;color:#38bdf8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                </div>
                <div class="flex-1">
                  <h3 class="text-sm font-bold" style="color:#38bdf8">{{ 'REPORTS.FORM.PHYSICAL' | translate }}</h3>
                  <p class="text-xs" style="color:var(--text-muted)">{{ physicalFields.length }} {{ 'REPORTS.FORM.METRICS' | translate }}</p>
                </div>
                <span class="text-xl font-black tabular-nums" [style.color]="categoryColors().physical">
                  {{ categoryAverages().physical || '—' }}
                </span>
              </div>
              <div class="space-y-5" formGroupName="physical">
                @for (field of ratingRows().physical; track field.key) {
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold" style="color:var(--text-secondary)">{{ field.label | translate }}</span>
                      <span class="text-sm font-black tabular-nums w-6 text-center" [style.color]="field.color">
                        {{ field.value }}
                      </span>
                    </div>
                    <div class="flex gap-1">
                      @for (n of pipRange; track n) {
                        <button type="button" class="pip pip-p flex-1"
                                [class.pip-on]="n <= field.value"
                                (click)="setRating(field.path, n)">{{ n }}</button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- ── Mental ── -->
            <div class="card p-5" style="border-top:3px solid #8b5cf6">
              <div class="cat-header">
                <div class="cat-icon" style="background:rgba(139,92,246,0.12)">
                  <svg style="width:17px;height:17px;color:#8b5cf6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.14Z"/>
                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.14Z"/>
                  </svg>
                </div>
                <div class="flex-1">
                  <h3 class="text-sm font-bold" style="color:#8b5cf6">{{ 'REPORTS.FORM.MENTAL' | translate }}</h3>
                  <p class="text-xs" style="color:var(--text-muted)">{{ mentalFields.length }} {{ 'REPORTS.FORM.METRICS' | translate }}</p>
                </div>
                <span class="text-xl font-black tabular-nums" [style.color]="categoryColors().mental">
                  {{ categoryAverages().mental || '—' }}
                </span>
              </div>
              <div class="space-y-5" formGroupName="mental">
                @for (field of ratingRows().mental; track field.key) {
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold" style="color:var(--text-secondary)">{{ field.label | translate }}</span>
                      <span class="text-sm font-black tabular-nums w-6 text-center" [style.color]="field.color">
                        {{ field.value }}
                      </span>
                    </div>
                    <div class="flex gap-1">
                      @for (n of pipRange; track n) {
                        <button type="button" class="pip pip-m flex-1"
                                [class.pip-on]="n <= field.value"
                                (click)="setRating(field.path, n)">{{ n }}</button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- ── Notes ── -->
            <div class="card p-5">
              <div class="cat-header">
                <div class="cat-icon" style="background:rgba(148,163,184,0.12)">
                  <svg style="width:17px;height:17px;color:var(--text-secondary)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div class="flex-1">
                  <h3 class="text-sm font-bold" style="color:var(--text-primary)">{{ 'REPORTS.FORM.NOTES' | translate }}</h3>
                  <p class="text-xs" style="color:var(--text-muted)">{{ 'REPORTS.FORM.NOTES_PH' | translate }}</p>
                </div>
                <span class="text-xs tabular-nums" style="color:var(--text-muted)">
                  {{ (form.get('notes')?.value?.length ?? 0) }}/1000
                </span>
              </div>
              <textarea formControlName="notes" class="form-input resize-none" rows="4" maxlength="1000"
                        [placeholder]="'REPORTS.FORM.NOTES_PH' | translate"></textarea>
            </div>

            <!-- ── Actions ── -->
            <div class="flex items-center gap-3 pb-2">
              <button type="submit" class="btn btn-primary" [disabled]="loading()">
                @if (loading()) {
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                } @else {
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                  </svg>
                }
                {{ loading() ? ('REPORTS.FORM.SAVING' | translate) : ('REPORTS.FORM.SAVE' | translate) }}
              </button>
              <a [routerLink]="['/players', playerId, 'reports']" class="btn btn-secondary">
                {{ 'REPORTS.FORM.CANCEL' | translate }}
              </a>
            </div>

          </div>

          <!-- ══ RIGHT: live preview ══ -->
          <div class="space-y-4 lg:sticky lg:top-4 lg:self-start">

            <!-- Overall score -->
            <div class="card p-5 text-center">
              <p class="text-xs font-semibold uppercase tracking-widest mb-4" style="color:var(--text-muted)">
                {{ 'REPORTS.FORM.OVERALL' | translate }}
              </p>
              <div class="overall-ring" [style]="overallRingStyle()">
                <div>
                  <div class="text-3xl font-black leading-none tabular-nums">{{ liveOverall() ?? '—' }}</div>
                  <div class="text-xs font-medium mt-0.5" style="color:var(--text-muted)">/ 10</div>
                </div>
              </div>
              <p class="text-xs mt-3" style="color:var(--text-muted)">{{ 'REPORTS.FORM.PREVIEW' | translate }}</p>

              <!-- Category breakdown bars -->
              <div class="mt-5 space-y-3 text-left">
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold" style="color:#22c55e">{{ 'REPORTS.FORM.TECHNICAL' | translate }}</span>
                    <span class="text-xs font-bold tabular-nums" style="color:#22c55e">{{ categoryAverages().technical }}</span>
                  </div>
                  <div class="h-1.5 rounded-full" style="background:rgba(34,197,94,0.12)">
                    <div class="cat-bar-fill" style="background:#22c55e"
                         [style.width]="(categoryAverages().technical * 10) + '%'"></div>
                  </div>
                </div>
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold" style="color:#38bdf8">{{ 'REPORTS.FORM.PHYSICAL' | translate }}</span>
                    <span class="text-xs font-bold tabular-nums" style="color:#38bdf8">{{ categoryAverages().physical }}</span>
                  </div>
                  <div class="h-1.5 rounded-full" style="background:rgba(56,189,248,0.12)">
                    <div class="cat-bar-fill" style="background:#38bdf8"
                         [style.width]="(categoryAverages().physical * 10) + '%'"></div>
                  </div>
                </div>
                <div>
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold" style="color:#8b5cf6">{{ 'REPORTS.FORM.MENTAL' | translate }}</span>
                    <span class="text-xs font-bold tabular-nums" style="color:#8b5cf6">{{ categoryAverages().mental }}</span>
                  </div>
                  <div class="h-1.5 rounded-full" style="background:rgba(139,92,246,0.12)">
                    <div class="cat-bar-fill" style="background:#8b5cf6"
                         [style.width]="(categoryAverages().mental * 10) + '%'"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Radar chart -->
            <div class="card p-4">
              <p class="text-xs font-semibold uppercase tracking-widest mb-3 text-center" style="color:var(--text-muted)">
                {{ 'REPORTS.FORM.RADAR' | translate }}
              </p>
              <app-radar-chart [data]="radarData()" />
            </div>

          </div>
        </div>
      </form>
    </div>
  `
})
export class ReportFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reportService = inject(ScoutingReportService);
  private readonly playerService = inject(PlayerService);
  private readonly seasonMatchService = inject(SeasonMatchService);
  private readonly teamService = inject(TeamService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly playerContext = inject(PlayerContextService);
  readonly auth = inject(AuthService);

  readonly loading = signal(false);

  // admin-assign-players-reports-media — admin-only, create-only. The player's
  // own observers[] (populated {_id,name}, already fetched by loadScopedOptions)
  // — this is exactly the set the server accepts for assignedObserver.
  readonly playerObservers = signal<{ _id: string; name: string }[]>([]);
  // مالك اللاعب المحترف (createdBy لما يكون role = proScout) — التقرير بيتكتب باسمه افتراضياً
  readonly playerProScout = signal<{ _id: string; name: string } | null>(null);
  // الـid المختار في "بالنيابة عن" — أوبزيرفر أو الـproScout (بيتفرقوا وقت الإرسال)
  readonly assignedObserver = signal('');

  // Teams scoped to the player's age group — homeTeam/awayTeam are Team ObjectIds
  readonly teamOptions = signal<Team[]>([]);
  readonly teamOptionsLoaded = signal(false);

  // Optional link to a scheduled SeasonMatch — auto-fills homeTeam/awayTeam when selected
  readonly seasonMatchOptions = signal<SeasonMatch[]>([]);
  readonly seasonMatchOptionsLoaded = signal(false);
  readonly selectedSeasonMatch = signal<string>('');

  // اللاعب متسجل في فريق فعلي؟ لو أيوه، لازم يختار مباراة النهارده بس (مفيش إدخال يدوي للفرق)
  readonly hasTeam = signal(false);
  // فريق اللاعب — بيتشال من قايمة المنافسين (مينفعش يلعب ضد نفسه)
  private playerTeamId = '';
  // اسمه بيتعرض ثابت للقراءة بس: الطرف الأول مش اختيار للكشاف، السيرفر بيحطه
  readonly playerTeamName = signal('');

  // اللاعب محترف؟ بيحدد نطاق التحميل (الدوري بدل الفئة العمرية) وكمان بيفتح
  // اختيار أي مباراة اتلعبت مش مباراة النهارده بس — الرخصة دي للـproScout وحده،
  // ومطبَّقة على السيرفر في resolveMatchTypeFields بنفس الشرط.
  readonly isProfessional = signal(false);

  // طلب مالك 2026-09 — قايمة "ربط بمباراة من جدول المواسم" اتشالت من واجهة
  // الناشئ: مافيش قرار للكشاف هنا أصلاً. لو فريق اللاعب عنده مباراة في الجدول
  // النهاردة أو امبارح، التقرير بيترتبط بيها **تلقائي** وبتتعرض للقراءة بس؛
  // ولو مافيش، بيروح على اختيار الفئة اللي لعب معاها.
  // المحترف هو الاستثناء الوحيد اللي القايمة باقية عنده: مبارياته متباعدة
  // وبيكتب تقريره بعدها بأيام، فاختيار المباراة هو مساره الأساسي (نفس الرخصة
  // المطبَّقة على السيرفر في resolveMatchTypeFields).
  readonly showFixturePicker = computed(() =>
    this.isProfessional() && this.seasonMatchOptionsLoaded() && this.seasonMatchOptions().length > 0
  );

  // المباراة المرتبطة تلقائي — نص للعرض بس
  readonly linkedMatchLabel = signal('');
  readonly showLinkedMatch = computed(() =>
    !this.isProfessional() && !!this.selectedSeasonMatch() && !!this.linkedMatchLabel()
  );

  // طلب مالك 2026-09 — التدريب والودية اتلغوا. لما مايكونش فيه مباراة من الجدول
  // متختارة، الكشاف بيحدد الفئة اللي اللاعب لعب معاها والفريق المنافس.
  // اللاعب المحترف مالوش فئة عمرية أصلاً، فبيختار المنافس على طول من فرق الدوري.
  // نفس شرط أزرار النوع القديمة بالظبط: لو فيه مباراة النهاردة في الجدول لازم
  // يربط التقرير بيها، والاختيار اليدوي بيظهر بس لما مايكونش فيه (أو للمحترف
  // اللي لسه مختارش من قايمة مبارياته).
  // المحترف والأدمن بيشوفوا قايمة مباريات ممتدة (كل اللي اتلعب، مش النهاردة بس)،
  // فالقايمة عندهم شبه دايماً مش فاضية — ولو ربطناهم بيها وحدها كان المسار اليدوي
  // هيبقى مقفول عليهم تماماً. فبيظهر لهم طول ما مافيش مباراة متختارة، وبيختفي أول
  // ما يختاروا واحدة. الكوتش/الأوبزيرفر زي ما هو بالظبط: قايمته النهاردة بس، فلو
  // فيه ماتش لازم يربط بيه.
  readonly showOpponentPicker = computed(() =>
    this.hasTeam() && this.seasonMatchOptionsLoaded() && !this.selectedSeasonMatch()
  );

  readonly showAgeGroupPicker = computed(() => this.showOpponentPicker() && !this.isProfessional());

  // القيمة الخاصة اللي بتظهر في السيلكت لما يختار "الفريق مش موجود في القايمة"
  readonly OTHER_TEAM = '__other__';
  readonly homeIsOther = signal(false);
  readonly awayIsOther = signal(false);

  // الفئة العمرية اللي اللاعب لعب معاها النهاردة (ممكن تكون غير فئته)، وفرق الفئة
  // دي عشان يختار منها المنافس — لو مالهاش فرق مسجلة بيكتب الاسم يدوي
  readonly ageGroupOptions = signal<AgeGroup[]>([]);
  readonly playedWithAgeGroup = signal('');
  readonly opponentOptions = signal<Team[]>([]);
  readonly opponentOptionsLoaded = signal(false);
  // فئة اللاعب نفسه — القيمة الافتراضية لـ"لعب مع فئة"
  private playerAgeGroupId = '';

  // ════════ بوابة الرسم ════════
  // القالب كان بيفرّع على إشارات قيمتها الابتدائية توافق فرعًا حقيقيًا، فأول
  // رسمة كانت بتطلع غلط (فرع "مضيف × ضيف" للاعب لسه بياناته في الطريق) وبعدين
  // الشكل بيتغيّر 4 مرات مع كل رد. الحل: قسم معلومات المباراة مايترسمش خالص
  // لحد ما البيانات اللي بتحدد شكله توصل كلها.
  readonly playerLoaded = signal(false);
  readonly agesLoaded = signal(false);
  // بنستنى فرق الفئة ومبارياتها كمان — بس لما يكون المسار ده هو اللي هيتعرض
  readonly ageGroupInputsPending = signal(false);
  // تحميل جارٍ لتبديل فئة بعد أول رسم — بيبهّت الحقل بدل ما يشيله
  readonly ageGroupInputsLoading = signal(false);

  readonly matchInputsReady = computed(() => {
    if (!this.playerLoaded() || !this.seasonMatchOptionsLoaded()) return false;
    if (this.ageGroupInputsPending()) return false;
    // قايمة الفئات مطلوبة بس لو الاختيار ده هو اللي هيتعرض — المحترف واللاعب
    // اللي مربوط بمباراة مابيستنوهاش
    if (this.showAgeGroupPicker() && !this.agesLoaded()) return false;
    return true;
  });

  // نادي اللاعب — الرابط الوحيد بين "الأهلي 2009" و"الأهلي 2007": فريقين
  // مختلفين تماماً بـ_id مختلف، بس نفس الـclubName.
  private playerClubName = '';
  // فريق نفس النادي في الفئة اللي لعب معاها (لو موجود) ومبارياته النهاردة/امبارح.
  // لما يكون فيه مباراة، التقرير بيترتبط بيها والمنافس بييجي منها — مفيش كتابة يدوية.
  readonly siblingTeamName = signal('');
  // القايمة محسوبة مسبقًا ({_id,label}) — مفيش استدعاء دالة جوه @for (قاعدة CLAUDE.md)
  readonly ageGroupMatchOptions = signal<{ _id: string; label: string }[]>([]);
  readonly selectedAgeGroupMatch = signal('');
  readonly submitted = signal(false);

  readonly technicalFields = TECHNICAL_FIELDS;
  readonly physicalFields = PHYSICAL_FIELDS;
  readonly mentalFields = MENTAL_FIELDS;

  // Report date = creation date, server-controlled & read-only in the UI
  readonly reportDate = signal<string>(new Date().toLocaleDateString());

  readonly form = this.fb.group({
    homeTeam: [''],
    homeTeamName: [''],
    awayTeam: [''],
    awayTeamName: [''],
    notes: [''],
    technical: this.fb.group({
      turning: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      dribbling: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      tackling: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      twoFooted: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      longPassing: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      shortPassing: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      heading: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
    }),
    physical: this.fb.group({
      shortSprints: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      longSprints: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      agility: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      aerialDuels: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      groundDuels: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
    }),
    mental: this.fb.group({
      vision: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      personality: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
      movement: [0, [Validators.required, Validators.min(1), Validators.max(10)]],
    }),
  });

  readonly pipRange = [1,2,3,4,5,6,7,8,9,10];

  private readonly formValues = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  readonly liveOverall = computed(() => {
    const v = this.formValues();
    const scores = [
      v.technical?.turning, v.technical?.dribbling, v.technical?.tackling, v.technical?.twoFooted,
      v.technical?.longPassing, v.technical?.shortPassing, v.technical?.heading,
      v.physical?.shortSprints, v.physical?.longSprints, v.physical?.agility, v.physical?.aerialDuels, v.physical?.groundDuels,
      v.mental?.vision, v.mental?.personality, v.mental?.movement,
    ].filter((s): s is number => s != null && s > 0);
    return scores.length === 15 ? +(scores.reduce((a, b) => a + b, 0) / 15).toFixed(1) : null;
  });

  readonly categoryAverages = computed(() => {
    const v = this.formValues();
    const avg = (nums: (number | null | undefined)[]): number => {
      const valid = nums.filter((x): x is number => x != null && x > 0);
      return valid.length ? +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : 0;
    };
    return {
      technical: avg([v.technical?.turning, v.technical?.dribbling, v.technical?.tackling, v.technical?.twoFooted, v.technical?.longPassing, v.technical?.shortPassing, v.technical?.heading]),
      physical:  avg([v.physical?.shortSprints, v.physical?.longSprints, v.physical?.agility, v.physical?.aerialDuels, v.physical?.groundDuels]),
      mental:    avg([v.mental?.vision, v.mental?.personality, v.mental?.movement]),
    };
  });

  // ⚠️ القالب كان بينده form.get('technical.' + key) **12 مرة لكل حقل** × 15 حقل
  // = 180 نداء + 180 `split('.')` + 180 نص متسلسل، في كل دورة تغيير — والقيم
  // كلها متاحة أصلاً في formValues. هنا بتتحسب مرة واحدة لما الفورم يتغير.
  readonly ratingRows = computed(() => {
    const v = this.formValues() as Record<string, Record<string, number | null> | undefined>;
    const build = (group: 'technical' | 'physical' | 'mental', fields: RatingField[]) =>
      fields.map(f => {
        const value = v?.[group]?.[f.key] ?? 0;
        return { key: f.key, label: f.label, path: `${group}.${f.key}`, value, color: ratingColorOf(value) };
      });
    return {
      technical: build('technical', TECHNICAL_FIELDS),
      physical: build('physical', PHYSICAL_FIELDS),
      mental: build('mental', MENTAL_FIELDS),
    };
  });

  readonly categoryColors = computed(() => {
    const a = this.categoryAverages();
    return { technical: ratingColorOf(a.technical), physical: ratingColorOf(a.physical), mental: ratingColorOf(a.mental) };
  });

  readonly radarData = computed(() => {
    const v = this.formValues();
    return {
      turning: v.technical?.turning ?? 0,
      dribbling: v.technical?.dribbling ?? 0,
      tackling: v.technical?.tackling ?? 0,
      twoFooted: v.technical?.twoFooted ?? 0,
      longPassing: v.technical?.longPassing ?? 0,
      shortPassing: v.technical?.shortPassing ?? 0,
      heading: v.technical?.heading ?? 0,
      shortSprints: v.physical?.shortSprints ?? 0,
      longSprints: v.physical?.longSprints ?? 0,
      agility: v.physical?.agility ?? 0,
      aerialDuels: v.physical?.aerialDuels ?? 0,
      groundDuels: v.physical?.groundDuels ?? 0,
      vision: v.mental?.vision ?? 0,
      personality: v.mental?.personality ?? 0,
      movement: v.mental?.movement ?? 0,
    };
  });

  today(): string {
    return new Date().toISOString().split('T')[0];
  }

  overallStyle(): string {
    const o = this.liveOverall();
    if (!o) return 'border-color:var(--border-color); color:var(--text-muted)';
    const color = o >= 8 ? '#22c55e' : o >= 5 ? '#f59e0b' : '#f43f5e';
    return `border-color:${color}; color:${color}`;
  }

  overallRingStyle(): string {
    const o = this.liveOverall();
    if (!o) return 'border-color:var(--border-color); color:var(--text-muted)';
    const color = o >= 8 ? '#22c55e' : o >= 5 ? '#f59e0b' : '#f43f5e';
    return `border-color:${color}; color:${color}; box-shadow:0 0 20px ${color}33`;
  }

  setRating(path: string, value: number): void {
    this.form.get(path)?.setValue(value);
  }

  get playerId(): string {
    return this.route.snapshot.pathFromRoot
      .map(s => s.paramMap.get('playerId'))
      .find(id => id != null) ?? '';
  }

  ngOnInit(): void {
    // الفورم ده للإنشاء بس. مسار التعديل (reports/:reportId/edit) مش موجود أصلاً
    // في players.routes.ts، وزرار "تعديل" اللي كان بيوجّهله اتشال — التقارير
    // للقراءة بعد الإنشاء والأدمن وحده بيمسح. (قرار المالك 2026-11)
    this.loadScopedOptions();
  }

  // اللاعب المحترف مالوش فئة عمرية أصلاً (playedModel: اشتقاق ageGroup بيتخطى
  // للمحترفين) — والدالة دي كانت مبنية على الفئة العمرية وحدها، فكانت بتعمل
  // return بدري لأي لاعب محترف قبل ما تحمّل أي حاجة. النتيجة للـproScout:
  //   • قايمة الفرق بتفضل فاضية — سواء كخصم في ودية أو في الاختيار اليدوي
  //   • مباريات النهارده مابتتحملش خالص، فالتقرير الرسمي (official) مستحيل
  //     يترتبط بمباراة محترفين حقيقية حتى لو فيه واحدة مجدولة النهارده فعلاً
  // الباك إند مكانش فيه مشكلة: resolveMatchTypeFields بيدوّر بالفريق والتاريخ
  // من غير أي قيد على الدوري، وبيقبل المباراة المحترفين عادي.
  //
  // الحل: نطاق المحترفين بالدوري (league: professional) بدل الفئة العمرية —
  // نفس اللي player-form.component.ts بيعمله بالظبط في سياق المحترفين، ونفس
  // النطاق اللي السيرفر مطبّقه للـproScout أصلاً في teamScopeFor/seasonMatchScopeFor.
  //
  // perf 2026-09 — الشكل ده كان شلال من 4 مستويات متسلسلة:
  //   /players/:id → /seasonMatches → /teams?ageGroup → /seasonMatches?ageGroup
  // وكل رد كان بيغيّر شكل القسم، فالمستخدم كان بيشوف 5 رسمات متتالية (أولها
  // فرع "مضيف × ضيف" اللي مالوش علاقة بالحالة أصلاً، لأن hasTeam() قيمتها
  // الابتدائية false). دلوقتي:
  //   • /ages بيتفرز **مع** /players/:id — مالوش أي اعتماد على أي رد.
  //   • فرق الفئة ومبارياتها بيتجابوا بالتوازي (forkJoin) فالقرار بيتاخد مرة واحدة.
  //   • القسم كله متخفي ورا matchInputsReady() لحد ما الشكل النهائي يتحدد.
  private loadScopedOptions(): void {
    // الـproScout ممنوع من GET /ages (403)، والمحترف مالوش فئة يختارها أصلاً —
    // بس إحنا لسه ماعرفناش هو محترف ولا لأ، فبنجيبها بالتوازي لكل غير الـproScout.
    // التكلفة طلب صغير واحد على جدول بيانات مرجعي، والمقابل إننا شلنا ردّة كاملة
    // من المسار الحرج لكل لاعب ناشئ.
    //
    // ⚠️ بالتوازي، **مش** forkJoin: الاتنين مستقلين تمامًا، وربطهم في forkJoin
    // كان معناه إن معالجة اللاعب كلها تستنى رد /ages — عكس المطلوب بالظبط.
    // البوابة (matchInputsReady) هي اللي بتقرر إمتى نرسم، وهي بتستنى /ages
    // **بس لو** اختيار الفئة هو اللي هيتعرض فعلاً.
    if (this.auth.isProScout()) {
      // الـproScout ممنوع من GET /ages (403)، والمحترف مالوش فئة يختارها أصلاً
      this.agesLoaded.set(true);
    } else {
      this.http.get<{ data?: { documents?: AgeGroup[] } }>(`${environment.apiUrl}/ages`)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: res => {
            this.ageGroupOptions.set(res.data?.documents ?? []);
            this.agesLoaded.set(true);
          },
          error: () => this.agesLoaded.set(true),
        });
    }

    // الأب (PlayerDetailComponent) جاب المستند ده بالفعل — و<router-outlet>
    // بتاعه جوه @if (player())، فإحنا مابنتركّبش قبل ما رده يوصل. الريكوست
    // التاني كان زيادة مؤكدة + ردّة كاملة على المسار الحرج.
    const cached = this.playerContext.playerDocument(this.playerId);
    const player$ = cached ? of(cached) : this.playerService.getOne(this.playerId);

    player$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => this.applyPlayer(res),
        error: () => {
          this.teamOptionsLoaded.set(true);
          this.seasonMatchOptionsLoaded.set(true);
          this.playerLoaded.set(true);
        },
      });
  }

  private applyPlayer(res: unknown): void {
        const player = (res as any)?.data?.document;
        const isProfessional = !!player?.isProfessional;
        const ageGroupId = player?.ageGroup ? (typeof player.ageGroup === 'string' ? player.ageGroup : player.ageGroup._id) : null;
        const teamId = this.teamId(player?.team ?? undefined);
        this.hasTeam.set(!!teamId);
        this.playerTeamId = teamId;
        this.playerTeamName.set(
          player?.team && typeof player.team === 'object' ? (player.team.name ?? '') : ''
        );
        this.playerClubName =
          player?.team && typeof player.team === 'object' ? (player.team.clubName ?? '') : '';
        this.playerAgeGroupId = ageGroupId ?? '';
        this.isProfessional.set(isProfessional);
        this.playerLoaded.set(true);

        // admin-assign-players-reports-media — observers[] only reaches an admin
        // (maskCoachForObserver/maskObservedForCoach never touch it for admin);
        // reuses the same getOne() call rather than a second request.
        if (this.auth.isAdmin() && Array.isArray(player?.observers)) {
          this.playerObservers.set(
            player.observers.filter((o: any) => o && typeof o === 'object' && o._id)
          );
        }
        const creator = player?.createdBy;
        if (this.auth.isAdmin() && creator && typeof creator === 'object' && creator.role === 'proScout') {
          this.playerProScout.set({ _id: creator._id, name: creator.name });
          this.assignedObserver.set(creator._id);
        }

        // لاعب ناشئ من غير فئة عمرية = حالة مالهاش نطاق نحمّل بيه، زي ما كانت
        if (!ageGroupId && !isProfessional) {
          this.teamOptionsLoaded.set(true);
          this.seasonMatchOptionsLoaded.set(true);
          return;
        }

        // perf — قايمة الفرق العامة (teamOptions) ليها مستهلك واحد بس في القالب:
        // فرع اللاعب اللي **مالوش فريق** (إدخال يدوي مضيف/ضيف). اللاعب اللي له
        // فريق عمره ما بيشوفها، وكانت بتتبعت له برضه على الفاضي. المحترف استثناء:
        // نفس القايمة هي قايمة منافسينه (مالوش فئة عمرية يتفلتر بيها).
        if (isProfessional) {
          this.teamService.getAll(undefined, 'professional')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
            next: teamRes => {
              const teams = teamRes.data?.documents ?? [];
              const scoped = teamId ? teams.filter(t => t._id !== teamId) : teams;
              this.teamOptions.set(scoped);
              this.opponentOptions.set(scoped);
              this.teamOptionsLoaded.set(true);
              this.opponentOptionsLoaded.set(true);
            },
            error: () => {
              this.teamOptionsLoaded.set(true);
              this.opponentOptionsLoaded.set(true);
            },
          });
        } else if (!teamId) {
          this.teamsFor(ageGroupId!)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(teams => {
            this.teamOptions.set(teams);
            this.teamOptionsLoaded.set(true);
          });
        } else {
          this.teamOptionsLoaded.set(true);
        }

        if (teamId) {
          const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
          const recent = this.recentWindow();

          // الـproScout مش مقيّد بيوم المباراة (نفس الرخصة في
          // resolveMatchTypeFields على السيرفر): بيشوف كل مباريات ناديه اللي
          // اتلعبت، من الأحدث للأقدم، ويكتب تقريره عليها وقت ما يقدر. الناشئ
          // زي ما هو بالظبط — مباريات النهارده بس.
          //
          // الناشئ (وكمان الأدمن على لاعب ناشئ): النافذة بقت النهاردة أو امبارح،
          // والأحدث هو اللي بيترتبط تلقائي — القايمة نفسها ماعادتش بتتعرض.
          const windowFilters = isProfessional
            ? { league: 'professional' as const, sort: '-matchDate' as const, 'matchDate[lte]': dayEnd.toISOString() }
            : { ageGroup: ageGroupId, sort: '-matchDate' as const, 'matchDate[gte]': recent.gte, 'matchDate[lte]': recent.lte };

          // ⚠️ ترتيب الإشارات هنا مقصود: seasonMatchOptionsLoaded وage-group
          // pending بيتكتبوا في **نفس** الـcallback، فالقالب مابيشوفش حالة
          // وسطية — إما لسه بيحمّل وإما الشكل النهائي.
          this.seasonMatchService.getAll(windowFilters)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: matchRes => {
                const own = (matchRes.data?.documents ?? [])
                  .filter(m => this.teamId(m.homeTeam) === teamId || this.teamId(m.awayTeam) === teamId);
                this.seasonMatchOptions.set(own);

                // الربط التلقائي: أحدث مباراة لفريقه في النافذة (النهاردة الأول،
                // وإلا امبارح). مفيش قايمة ولا اختيار — السيرفر بيتحقق من نفس
                // الشرط في resolveMatchTypeFields.
                if (!isProfessional && own.length > 0) {
                  this.linkMatch(own[0]);
                }

                if (!isProfessional && !this.selectedSeasonMatch()) {
                  this.seedDefaultAgeGroup();
                }
                this.seasonMatchOptionsLoaded.set(true);
              },
              error: () => {
                // فشل تحميل المباريات = القايمة فاضية = الاختيار اليدوي ظاهر
                if (!isProfessional) this.seedDefaultAgeGroup();
                this.seasonMatchOptionsLoaded.set(true);
              },
            });
          return;
        }

        this.seasonMatchOptionsLoaded.set(true);
  }

  private teamName(team: SeasonMatch['homeTeam']): string {
    return typeof team === 'string' ? team : team.name;
  }

  private teamId(team: SeasonMatch['homeTeam'] | undefined): string {
    if (!team) return '';
    return typeof team === 'string' ? team : team._id;
  }

  matchOptionLabel(m: SeasonMatch): string {
    const date = new Date(m.matchDate).toLocaleDateString();
    return `${this.teamName(m.homeTeam)} vs ${this.teamName(m.awayTeam)} — ${date}`;
  }

  // ربط التقرير بمباراة من الجدول — الفرق بتتقفل لأن السيرفر بياخدها من المباراة
  private linkMatch(match: SeasonMatch): void {
    this.selectedSeasonMatch.set(match._id);
    this.linkedMatchLabel.set(this.matchOptionLabel(match));
    this.form.patchValue({ homeTeam: this.teamId(match.homeTeam), awayTeam: this.teamId(match.awayTeam) });
    this.form.get('homeTeam')?.disable();
    this.form.get('awayTeam')?.disable();
  }

  onSeasonMatchChange(id: string): void {
    this.selectedSeasonMatch.set(id);
    const match = this.seasonMatchOptions().find(m => m._id === id);
    if (match) {
      this.form.patchValue({ homeTeam: this.teamId(match.homeTeam), awayTeam: this.teamId(match.awayTeam) });
      this.form.get('homeTeam')?.disable();
      this.form.get('awayTeam')?.disable();
    } else {
      this.form.get('homeTeam')?.enable();
      this.form.get('awayTeam')?.enable();
    }
  }

  onPlayedWithChange(ageGroupId: string): void {
    this.playedWithAgeGroup.set(ageGroupId);
    // الفئة اتغيرت → المنافس المختار بقى من فئة تانية، فبنفضّيه
    this.awayIsOther.set(false);
    this.form.patchValue({ awayTeam: '', awayTeamName: '' });
    // مش blocking: الحقل بيتقفل مؤقتاً لحد ما القايمة الجديدة توصل، مايختفيش
    this.loadAgeGroupInputs(ageGroupId, { blocking: false });
  }

  // perf — GET /teams?ageGroup=X بيتنده مرة واحدة لكل فئة طول عمر الفورم.
  // من غير الكاش ده، فتح الفورم كان بيبعت نفس الطلب مرتين (فئة اللاعب مرة
  // كـteamOptions ومرة كقايمة منافسين افتراضية)، وكل رجوع لفئة اتشافت قبل كده
  // كان بيبعت طلب جديد. shareReplay بيخلي الطلبات المتوازية تشترك في استجابة
  // واحدة، والفشل بيمسح المدخل عشان المحاولة الجاية تعيد الطلب فعلاً.
  private readonly teamsByAgeGroup = new Map<string, Observable<Team[]>>();

  private teamsFor(ageGroupId: string): Observable<Team[]> {
    const cached = this.teamsByAgeGroup.get(ageGroupId);
    if (cached) return cached;
    // undefined صريحة للدوري: نفس التوقيع اللي الفرونت كان بينده بيه قبل الكاش
    const req$ = this.teamService.getAll(ageGroupId, undefined).pipe(
      map(res => res.data?.documents ?? []),
      catchError(() => {
        this.teamsByAgeGroup.delete(ageGroupId);
        return of<Team[]>([]);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.teamsByAgeGroup.set(ageGroupId, req$);
    return req$;
  }

  // الافتراضي "لعب مع" = فئة اللاعب نفسه، وبيتحدد **قبل** ما القسم يترسم عشان
  // القايمة ماتظهرش فاضية وبعدين تقفز لقيمة.
  private seedDefaultAgeGroup(): void {
    if (!this.playerAgeGroupId || this.playedWithAgeGroup()) return;
    this.playedWithAgeGroup.set(this.playerAgeGroupId);
    this.loadAgeGroupInputs(this.playerAgeGroupId, { blocking: true });
  }

  // فرق الفئة اللي لعب معاها + مباريات نفس النادي فيها — **بالتوازي**.
  // اللاعب مواليد 2009 بيلعب مع 2007 بتاعة ناديه: الفئة دي ليها جدول، فبنجيب
  // مباراة النهاردة (أو امبارح) بتاعت فريق ناديه ونربط التقرير بيها على طول.
  //
  // perf 2026-09 — الاتنين كانوا متسلسلين (الفرق الأول عشان نعرف id فريق النادي،
  // وبعدين المباريات)، فالمستخدم كان بيشوف حقل المنافس يظهر وبعد ردّة كاملة
  // يتلغي لما المباراة تترتبط. دلوقتي بيتجابوا مع بعض والمطابقة بتحصل في
  // الذاكرة، فالقرار بيتاخد **مرة واحدة** وبرسمة واحدة.
  //
  // blocking: أول تحميل — القسم كله مخفي لحد ما يخلص (matchInputsReady).
  //           تبديل الفئة بعد كده مش blocking: الحقل بيبهت بس مابيختفيش.
  private loadAgeGroupInputs(ageGroupId: string, opts: { blocking: boolean }): void {
    if (!ageGroupId) {
      this.opponentOptions.set([]);
      this.opponentOptionsLoaded.set(true);
      this.siblingTeamName.set('');
      this.ageGroupMatchOptions.set([]);
      this.selectedAgeGroupMatch.set('');
      return;
    }

    if (opts.blocking) this.ageGroupInputsPending.set(true);
    this.ageGroupInputsLoading.set(true);

    const { gte, lte } = this.recentWindow();
    forkJoin({
      teams: this.teamsFor(ageGroupId),
      matches: this.seasonMatchService
        .getAll({ ageGroup: ageGroupId, sort: '-matchDate', 'matchDate[gte]': gte, 'matchDate[lte]': lte })
        .pipe(
          map(res => res.data?.documents ?? []),
          catchError(() => of<SeasonMatch[]>([])),
        ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ teams, matches }) => {
          // تبديل سريع بين فئتين ممكن يرجّع استجابة قديمة بعد الجديدة — بنتجاهلها
          if (this.playedWithAgeGroup() !== ageGroupId) return;

          const sibling = this.playerClubName
            ? teams.find(t => t.clubName === this.playerClubName)
            : undefined;
          this.siblingTeamName.set(sibling?.name ?? '');
          // فريق اللاعب وفريق ناديه في الفئة دي الاتنين مستبعدين من المنافسين
          this.opponentOptions.set(
            teams.filter(t => t._id !== this.playerTeamId && t._id !== sibling?._id)
          );
          this.opponentOptionsLoaded.set(true);

          // فريق النادي في الفئة دي لو هو فريق اللاعب نفسه، فمبارياته اتفحصت
          // فوق بالفعل وطلعت فاضية (وإلا كان الربط التلقائي اشتغل) — فمفيش
          // مباراة فئة تتعرض هنا.
          const rows =
            sibling && sibling._id !== this.playerTeamId
              ? matches
                  .filter(m => this.teamId(m.homeTeam) === sibling._id || this.teamId(m.awayTeam) === sibling._id)
                  .map(m => ({ _id: m._id, label: this.matchOptionLabel(m) }))
              : [];

          this.ageGroupMatchOptions.set(rows);

          // الأحدث بيتختار تلقائي — "يجيبهاله على طول"
          if (rows.length > 0) {
            this.selectAgeGroupMatch(rows[0]._id);
          } else {
            this.selectedAgeGroupMatch.set('');
          }

          this.ageGroupInputsLoading.set(false);
          this.ageGroupInputsPending.set(false);
        },
        error: () => {
          this.opponentOptions.set([]);
          this.opponentOptionsLoaded.set(true);
          this.ageGroupMatchOptions.set([]);
          this.selectedAgeGroupMatch.set('');
          this.ageGroupInputsLoading.set(false);
          this.ageGroupInputsPending.set(false);
        },
      });
  }

  // اختيار مباراة الفئة — يدوي أو تلقائي، ودايماً بيفضّي الإدخال اليدوي للمنافس.
  // ⚠️ الفرع التلقائي كان مابيفضّيش: لو المستخدم كان كتب اسم منافس قبل ما
  // المباراة توصل، الاسم كان بيفضل في الفورم والتقرير بيتسجّل بالمباراة —
  // البيانات اللي كتبها بتتجاهل في صمت.
  private selectAgeGroupMatch(id: string): void {
    this.selectedAgeGroupMatch.set(id);
    if (!id) return;
    this.awayIsOther.set(false);
    this.form.patchValue({ awayTeam: '', awayTeamName: '' });
  }

  // نافذة "النهاردة أو امبارح" — من بداية امبارح محليًا لآخر النهاردة.
  // السيرفر بيقارن بالـUTC، فالنافذة هنا أوسع شوية عن قصد (العميل بيعرض، والسيرفر بيقرر).
  private recentWindow(): { gte: string; lte: string } {
    const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return { gte: start.toISOString(), lte: end.toISOString() };
  }

  onAgeGroupMatchChange(id: string): void {
    this.selectAgeGroupMatch(id);
  }


  awayTeam(): string {
    return this.form.get('awayTeam')?.value ?? '';
  }

  // side select changed — إما فريق حقيقي (id) أو "مش موجود في القايمة" فبيظهر إنپوت الاسم الحر
  onTeamSelectChange(side: 'home' | 'away', value: string): void {
    const isOther = value === this.OTHER_TEAM;
    if (side === 'home') {
      this.homeIsOther.set(isOther);
      this.form.patchValue({ homeTeam: isOther ? '' : value, homeTeamName: '' });
    } else {
      this.awayIsOther.set(isOther);
      this.form.patchValue({ awayTeam: isOther ? '' : value, awayTeamName: '' });
    }
  }

  submit(): void {
    this.submitted.set(true);

    // نفس التفريع الثلاثي بتاع القالب بالظبط: مباراة مختارة، ولا تدريب/ودية،
    // ولا إدخال يدوي للاعب من غير فريق.
    if (this.selectedSeasonMatch()) {
      // مفيش مطلوب زيادة — المباراة بتملأ الفرق والتاريخ من السيرفر
    } else if (this.showOpponentPicker()) {
      if (this.showAgeGroupPicker() && !this.playedWithAgeGroup()) return;
      // مربوط بمباراة الفئة → المنافس جاي منها، مش مطلوب إدخال
      if (!this.selectedAgeGroupMatch() && !this.awayTeam() && !this.form.get('awayTeamName')?.value) return;
    } else if (!this.hasTeam()) {
      const homeOk = this.homeIsOther() ? !!this.form.get('homeTeamName')?.value : !!this.form.get('homeTeam')?.value;
      const awayOk = this.awayIsOther() ? !!this.form.get('awayTeamName')?.value : !!this.form.get('awayTeam')?.value;
      if (!homeOk || !awayOk) return;
    }

    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);

    const v = this.form.getRawValue();
    // matchDate is set server-side (creation date, or the linked match's date) — never sent by the client
    const payload: Record<string, unknown> = {
      notes: v.notes,
      technical: v.technical,
      physical: v.physical,
      mental: v.mental,
    };

    if (this.selectedSeasonMatch()) {
      // مباراة من الجدول — السيرفر بياخد منها الفرق وmatchDate الحقيقي.
      // matchType بيتبعت official صراحةً عشان المحترف اللي بيختار مباراة قديمة
      // يعدّي من فرع الـproScout في resolveMatchTypeFields مش من فرع النهارده.
      payload['seasonMatch'] = this.selectedSeasonMatch();
      payload['matchType'] = 'official';
    } else if (this.showOpponentPicker()) {
      // الفئة اللي لعب معاها. لو فريق ناديه في الفئة دي عنده مباراة في الجدول،
      // بنربط التقرير بيها (السيرفر بياخد منها الفرق وmatchDate الحقيقي) —
      // وغير كده المنافس بيتكتب/يتختار يدوي.
      payload['matchType'] = 'official';
      if (this.playedWithAgeGroup()) payload['playedWithAgeGroup'] = this.playedWithAgeGroup();
      if (this.selectedAgeGroupMatch()) {
        payload['seasonMatch'] = this.selectedAgeGroupMatch();
      } else if (this.awayIsOther() || !this.awayTeam()) {
        payload['awayTeamName'] = v.awayTeamName;
      } else {
        payload['awayTeam'] = v.awayTeam;
      }
    } else {
      if (this.homeIsOther()) payload['homeTeamName'] = v.homeTeamName; else payload['homeTeam'] = v.homeTeam;
      if (this.awayIsOther()) payload['awayTeamName'] = v.awayTeamName; else payload['awayTeam'] = v.awayTeam;
    }

    // admin-assign-players-reports-media — only ever attached for an admin on
    // create, and only when a specific observer was chosen (empty = self).
    if (this.auth.isAdmin() && this.assignedObserver()) {
      const isProScout = this.assignedObserver() === this.playerProScout()?._id;
      payload[isProScout ? 'assignedProScout' : 'assignedObserver'] = this.assignedObserver();
    }

    // بلا takeUntilDestroyed عن قصد: الحفظ لازم يكمّل حتى لو الكومبوننت اتدمّر
    this.reportService.create(this.playerId, payload as any).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('REPORTS.FORM.SAVE'));
        this.router.navigate(['/players', this.playerId, 'reports']);
      },
      error: () => this.loading.set(false),
      complete: () => this.loading.set(false),
    });
  }
}
