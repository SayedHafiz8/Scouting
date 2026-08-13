import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ScoutingReportService } from '../services/scouting-report.service';
import { ToastService } from '../../../core/services/toast.service';
import { RadarChartComponent } from '../../../shared/components/radar-chart/radar-chart.component';
import { PlayerService } from '../../players/services/player.service';
import { SeasonMatchService } from '../../season-matches/services/season-match.service';
import { SeasonMatch } from '../../../core/models/season-match.model';
import { TeamService } from '../../teams/services/team.service';
import { Team } from '../../../core/models/team.model';

interface RatingField { key: string; label: string; }

const TECHNICAL_FIELDS: RatingField[] = [
  { key: 'passing', label: 'REPORTS.FORM.PASSING' },
  { key: 'dribbling', label: 'REPORTS.FORM.DRIBBLING' },
  { key: 'shooting', label: 'REPORTS.FORM.SHOOTING' },
  { key: 'ballControl', label: 'REPORTS.FORM.BALL_CONTROL' },
];

const PHYSICAL_FIELDS: RatingField[] = [
  { key: 'speed', label: 'REPORTS.FORM.SPEED' },
  { key: 'stamina', label: 'REPORTS.FORM.STAMINA' },
  { key: 'strength', label: 'REPORTS.FORM.STRENGTH' },
  { key: 'agility', label: 'REPORTS.FORM.AGILITY' },
];

const MENTAL_FIELDS: RatingField[] = [
  { key: 'positioning', label: 'REPORTS.FORM.POSITIONING' },
  { key: 'decisionMaking', label: 'REPORTS.FORM.DECISION_MAKING' },
  { key: 'teamwork', label: 'REPORTS.FORM.TEAMWORK' },
  { key: 'attitude', label: 'REPORTS.FORM.ATTITUDE' },
];

@Component({
    selector: 'app-report-form',
    imports: [ReactiveFormsModule, FormsModule, RouterLink, RadarChartComponent, TranslatePipe],
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
          {{ isEdit() ? ('REPORTS.FORM.EDIT' | translate) : ('REPORTS.FORM.NEW' | translate) }}
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

              @if (hasTeam() && seasonMatchOptionsLoaded() && seasonMatchOptions().length > 0) {
                <!-- اللاعب متسجل في فريق وله مباراة رسمية النهارده — لازم يختارها، مفيش إدخال يدوي -->
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
              } @else if (hasTeam()) {
                <!-- فريق اللاعب متسجل لكن مفيش مباراة رسمية النهارده — يختار تدريب ولا مباراة ودية -->
                <div class="space-y-2.5">
                  <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                    {{ 'REPORTS.FORM.REPORT_TYPE' | translate }}
                  </label>
                  <div class="flex gap-2">
                    <button type="button" class="btn btn-sm flex-1" [class]="matchType() === 'training' ? 'btn-primary' : 'btn-secondary'" (click)="setMatchType('training')">
                      {{ 'REPORTS.FORM.TRAINING' | translate }}
                    </button>
                    <button type="button" class="btn btn-sm flex-1" [class]="matchType() === 'friendly' ? 'btn-primary' : 'btn-secondary'" (click)="setMatchType('friendly')">
                      {{ 'REPORTS.FORM.FRIENDLY' | translate }}
                    </button>
                  </div>

                  @if (matchType() === 'friendly') {
                    <div class="space-y-1.5 pt-1">
                      <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                        {{ 'REPORTS.FORM.OPPONENT_TEAM' | translate }}
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
                      @if (submitted() && matchType() === 'friendly' && !awayTeam() && !form.get('awayTeamName')?.value) {
                        <p class="field-error">{{ 'REPORTS.FORM.TEAMS_ERR' | translate }}</p>
                      }
                    </div>
                  } @else if (matchType() === 'training') {
                    <p class="text-xs" style="color:var(--text-muted)">{{ 'REPORTS.FORM.TRAINING_HINT' | translate }}</p>
                  } @else if (submitted()) {
                    <p class="field-error">{{ 'REPORTS.FORM.REPORT_TYPE_ERR' | translate }}</p>
                  }
                </div>
              } @else {
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
                <span class="text-xl font-black tabular-nums" [style.color]="ratingColor(categoryAverages().technical)">
                  {{ categoryAverages().technical || '—' }}
                </span>
              </div>
              <div class="space-y-5" formGroupName="technical">
                @for (field of technicalFields; track field.key) {
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold" style="color:var(--text-secondary)">{{ field.label | translate }}</span>
                      <span class="text-sm font-black tabular-nums w-6 text-center"
                            [style.color]="ratingColor(form.get('technical.' + field.key)?.value)">
                        {{ form.get('technical.' + field.key)?.value ?? 5 }}
                      </span>
                    </div>
                    <div class="flex gap-1">
                      @for (n of pipRange; track n) {
                        <button type="button" class="pip pip-t flex-1"
                                [class.pip-on]="(form.get('technical.' + field.key)?.value ?? 0) >= n"
                                (click)="setRating('technical.' + field.key, n)">{{ n }}</button>
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
                <span class="text-xl font-black tabular-nums" [style.color]="ratingColor(categoryAverages().physical)">
                  {{ categoryAverages().physical || '—' }}
                </span>
              </div>
              <div class="space-y-5" formGroupName="physical">
                @for (field of physicalFields; track field.key) {
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold" style="color:var(--text-secondary)">{{ field.label | translate }}</span>
                      <span class="text-sm font-black tabular-nums w-6 text-center"
                            [style.color]="ratingColor(form.get('physical.' + field.key)?.value)">
                        {{ form.get('physical.' + field.key)?.value ?? 5 }}
                      </span>
                    </div>
                    <div class="flex gap-1">
                      @for (n of pipRange; track n) {
                        <button type="button" class="pip pip-p flex-1"
                                [class.pip-on]="(form.get('physical.' + field.key)?.value ?? 0) >= n"
                                (click)="setRating('physical.' + field.key, n)">{{ n }}</button>
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
                <span class="text-xl font-black tabular-nums" [style.color]="ratingColor(categoryAverages().mental)">
                  {{ categoryAverages().mental || '—' }}
                </span>
              </div>
              <div class="space-y-5" formGroupName="mental">
                @for (field of mentalFields; track field.key) {
                  <div class="space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-semibold" style="color:var(--text-secondary)">{{ field.label | translate }}</span>
                      <span class="text-sm font-black tabular-nums w-6 text-center"
                            [style.color]="ratingColor(form.get('mental.' + field.key)?.value)">
                        {{ form.get('mental.' + field.key)?.value ?? 5 }}
                      </span>
                    </div>
                    <div class="flex gap-1">
                      @for (n of pipRange; track n) {
                        <button type="button" class="pip pip-m flex-1"
                                [class.pip-on]="(form.get('mental.' + field.key)?.value ?? 0) >= n"
                                (click)="setRating('mental.' + field.key, n)">{{ n }}</button>
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
                {{ loading() ? ('REPORTS.FORM.SAVING' | translate) : (isEdit() ? ('REPORTS.FORM.UPDATE' | translate) : ('REPORTS.FORM.SAVE' | translate)) }}
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
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(false);
  readonly isEdit = signal(false);
  private reportId = '';

  // Teams scoped to the player's age group — homeTeam/awayTeam are Team ObjectIds
  readonly teamOptions = signal<Team[]>([]);
  readonly teamOptionsLoaded = signal(false);

  // Optional link to a scheduled SeasonMatch — auto-fills homeTeam/awayTeam when selected
  readonly seasonMatchOptions = signal<SeasonMatch[]>([]);
  readonly seasonMatchOptionsLoaded = signal(false);
  readonly selectedSeasonMatch = signal<string>('');

  // اللاعب متسجل في فريق فعلي؟ لو أيوه، لازم يختار مباراة النهارده بس (مفيش إدخال يدوي للفرق)
  readonly hasTeam = signal(false);

  // القيمة الخاصة اللي بتظهر في السيلكت لما يختار "الفريق مش موجود في القايمة"
  readonly OTHER_TEAM = '__other__';
  readonly homeIsOther = signal(false);
  readonly awayIsOther = signal(false);

  // نوع التقرير لما فريق اللاعب متسجل ومفيش مباراة رسمية النهارده — تدريب ولا ودية
  readonly matchType = signal<'friendly' | 'training' | ''>('');
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
      passing: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      dribbling: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      shooting: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      ballControl: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
    }),
    physical: this.fb.group({
      speed: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      stamina: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      strength: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      agility: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
    }),
    mental: this.fb.group({
      positioning: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      decisionMaking: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      teamwork: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
      attitude: [5, [Validators.required, Validators.min(1), Validators.max(10)]],
    }),
  });

  readonly pipRange = [1,2,3,4,5,6,7,8,9,10];

  private readonly formValues = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  readonly liveOverall = computed(() => {
    const v = this.formValues();
    const scores = [
      v.technical?.passing, v.technical?.dribbling, v.technical?.shooting, v.technical?.ballControl,
      v.physical?.speed, v.physical?.stamina, v.physical?.strength, v.physical?.agility,
      v.mental?.positioning, v.mental?.decisionMaking, v.mental?.teamwork, v.mental?.attitude,
    ].filter((s): s is number => s != null && s > 0);
    return scores.length === 12 ? +(scores.reduce((a, b) => a + b, 0) / 12).toFixed(1) : null;
  });

  readonly categoryAverages = computed(() => {
    const v = this.formValues();
    const avg = (nums: (number | null | undefined)[]): number => {
      const valid = nums.filter((x): x is number => x != null && x > 0);
      return valid.length ? +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(1) : 0;
    };
    return {
      technical: avg([v.technical?.passing, v.technical?.dribbling, v.technical?.shooting, v.technical?.ballControl]),
      physical:  avg([v.physical?.speed, v.physical?.stamina, v.physical?.strength, v.physical?.agility]),
      mental:    avg([v.mental?.positioning, v.mental?.decisionMaking, v.mental?.teamwork, v.mental?.attitude]),
    };
  });

  readonly radarData = computed(() => {
    const v = this.formValues();
    return {
      passing: v.technical?.passing ?? 5,
      dribbling: v.technical?.dribbling ?? 5,
      shooting: v.technical?.shooting ?? 5,
      ballControl: v.technical?.ballControl ?? 5,
      speed: v.physical?.speed ?? 5,
      stamina: v.physical?.stamina ?? 5,
      strength: v.physical?.strength ?? 5,
      agility: v.physical?.agility ?? 5,
      positioning: v.mental?.positioning ?? 5,
      decisionMaking: v.mental?.decisionMaking ?? 5,
      teamwork: v.mental?.teamwork ?? 5,
      attitude: v.mental?.attitude ?? 5,
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

  ratingColor(value: number | null | undefined): string {
    if (!value) return 'var(--text-muted)';
    return value >= 8 ? '#22c55e' : value >= 5 ? '#f59e0b' : '#f43f5e';
  }

  get playerId(): string {
    return this.route.snapshot.pathFromRoot
      .map(s => s.paramMap.get('playerId'))
      .find(id => id != null) ?? '';
  }

  ngOnInit(): void {
    this.loadAgeGroupScopedOptions();

    this.reportId = this.route.snapshot.paramMap.get('reportId') ?? '';
    if (this.reportId) {
      this.isEdit.set(true);
      this.reportService.getOne(this.playerId, this.reportId).subscribe(res => {
        const r = (res.data as any)?.document;
        if (r) {
          if (r.matchDate) this.reportDate.set(new Date(r.matchDate).toLocaleDateString());
          if (r.seasonMatch) {
            const id = typeof r.seasonMatch === 'string' ? r.seasonMatch : r.seasonMatch._id;
            this.selectedSeasonMatch.set(id);
          }
          if (r.matchType) this.matchType.set(r.matchType === 'training' ? 'training' : r.matchType === 'friendly' ? 'friendly' : '');
          this.form.patchValue({
            homeTeam: this.teamId(r.homeTeam),
            homeTeamName: r.homeTeamName ?? '',
            awayTeam: this.teamId(r.awayTeam),
            awayTeamName: r.awayTeamName ?? '',
            notes: r.notes ?? '',
            technical: r.technical,
            physical: r.physical,
            mental: r.mental,
          });
          this.homeIsOther.set(!this.teamId(r.homeTeam) && !!r.homeTeamName);
          this.awayIsOther.set(!this.teamId(r.awayTeam) && !!r.awayTeamName);
          if (r.seasonMatch) {
            this.form.get('homeTeam')?.disable();
            this.form.get('awayTeam')?.disable();
          }
        }
      });
    }
  }

  private loadAgeGroupScopedOptions(): void {
    this.playerService.getOne(this.playerId).subscribe({
      next: res => {
        const player = (res.data as any)?.document;
        const ageGroupId = player?.ageGroup ? (typeof player.ageGroup === 'string' ? player.ageGroup : player.ageGroup._id) : null;
        const teamId = this.teamId(player?.team ?? undefined);
        this.hasTeam.set(!!teamId);

        if (!ageGroupId) {
          this.teamOptionsLoaded.set(true);
          this.seasonMatchOptionsLoaded.set(true);
          return;
        }

        // قايمة الفرق المسجلة دايمًا محملة — للاختيار اليدوي (لاعب من غير فريق) أو كخصم في
        // مباراة ودية (لاعب متسجل). فريق اللاعب نفسه بيتشال من الاختيارات (مينفعش يلعب ضد نفسه)
        this.teamService.getAll(ageGroupId).subscribe({
          next: teamRes => {
            const teams = teamRes.data?.documents ?? [];
            this.teamOptions.set(teamId ? teams.filter(t => t._id !== teamId) : teams);
            this.teamOptionsLoaded.set(true);
          },
          error: () => this.teamOptionsLoaded.set(true),
        });

        if (teamId) {
          // اللاعب متسجل في فريق — نبص هل له مباراة رسمية النهارده بس (مش أي فريق ولا أي يوم)
          const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);
          this.seasonMatchService.getAll({
            ageGroup: ageGroupId, sort: 'matchDate',
            'matchDate[gte]': dayStart.toISOString(), 'matchDate[lte]': dayEnd.toISOString(),
          }).subscribe({
            next: matchRes => {
              const todaysMatches = (matchRes.data?.documents ?? [])
                .filter(m => this.teamId(m.homeTeam) === teamId || this.teamId(m.awayTeam) === teamId);
              this.seasonMatchOptions.set(todaysMatches);
              this.seasonMatchOptionsLoaded.set(true);
            },
            error: () => this.seasonMatchOptionsLoaded.set(true),
          });
          return;
        }

        this.seasonMatchOptionsLoaded.set(true);
      },
      error: () => {
        this.teamOptionsLoaded.set(true);
        this.seasonMatchOptionsLoaded.set(true);
      },
    });
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

  setMatchType(type: 'friendly' | 'training'): void {
    this.matchType.set(type);
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

    if (this.hasTeam() && this.seasonMatchOptions().length === 0) {
      if (!this.matchType()) return;
      if (this.matchType() === 'friendly' && !this.awayTeam() && !this.form.get('awayTeamName')?.value) return;
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

    if (this.hasTeam() && this.seasonMatchOptions().length === 0) {
      // مفيش مباراة رسمية النهارده — تدريب أو ودية
      payload['matchType'] = this.matchType();
      if (this.matchType() === 'friendly') {
        if (this.awayIsOther()) payload['awayTeamName'] = v.awayTeamName;
        else payload['awayTeam'] = v.awayTeam;
      }
    } else if (this.selectedSeasonMatch()) {
      payload['seasonMatch'] = this.selectedSeasonMatch();
    } else {
      if (this.homeIsOther()) payload['homeTeamName'] = v.homeTeamName; else payload['homeTeam'] = v.homeTeam;
      if (this.awayIsOther()) payload['awayTeamName'] = v.awayTeamName; else payload['awayTeam'] = v.awayTeam;
    }

    const req$ = this.isEdit()
      ? this.reportService.update(this.playerId, this.reportId, payload as any)
      : this.reportService.create(this.playerId, payload as any);

    req$.subscribe({
      next: () => {
        this.toast.success(this.isEdit() ? this.translate.instant('REPORTS.FORM.UPDATE') : this.translate.instant('REPORTS.FORM.SAVE'));
        this.router.navigate(['/players', this.playerId, 'reports']);
      },
      error: () => this.loading.set(false),
      complete: () => this.loading.set(false),
    });
  }
}
