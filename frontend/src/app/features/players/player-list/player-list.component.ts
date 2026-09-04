import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { PlayerService } from '../services/player.service';
import { ScoutingReportService } from '../../scouting-reports/services/scouting-report.service';
import { TeamService } from '../../teams/services/team.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Player, PlayerFilters, PlayerPosition, PlayerStatus, PLAYER_POSITIONS } from '../../../core/models/player.model';
import { AgeGroup } from '../../../core/models/age-group.model';
import { Team } from '../../../core/models/team.model';
import { Pagination, PaginatedResponse } from '../../../core/models/api-response.model';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ImageLightboxComponent } from '../../../shared/components/image-lightbox/image-lightbox.component';

// audit-frontend P6 — 300ms: أطول من الفاصل الطبيعي بين ضغطتي زرار في الكتابة
// (~120ms) فبيجمّع الكلمة في طلب واحد، وأقصر من إن المستخدم يحس إن الصفحة واقفة.
const SEARCH_DEBOUNCE_MS = 300;

@Component({
    selector: 'app-player-list',
    imports: [RouterLink, FormsModule, TitleCasePipe, SkeletonLoaderComponent, EmptyStateComponent, ConfirmDialogComponent, ImageLightboxComponent, TranslatePipe],
    template: `
    <div class="space-y-5">

      <!-- ── Header ── -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="page-title">{{ 'PLAYERS.TITLE' | translate }}</h2>
          <p class="page-subtitle">
            <span class="tabular-nums font-semibold" style="color:var(--accent)">{{ total() }}</span>
            {{ 'PLAYERS.TOTAL' | translate:{count: ''} }}
          </p>
        </div>
        <!-- Stage 4 (FR-007) — proScout may create players, so it gets the control.
             observer-matches-and-players — observer joins too. context=professional
             is a hint for player-form, distinct from this page's own isProfessional
             filter param: while inside the professional lens (professionalOnly()),
             an observer's "Add" must land in the professional context, since — unlike
             proScout — that role isn't determined by identity alone. -->
        @if (auth.isCoach() || auth.isProScout() || auth.isObserver()) {
          <a routerLink="/players/new" [queryParams]="professionalOnly() ? { context: 'professional' } : {}" class="btn btn-primary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {{ 'PLAYERS.ADD' | translate }}
          </a>
        }
      </div>

      <!-- ── Status filter chips (hidden for observers — all their players are "observed") ── -->
      @if (!auth.isObserver()) {
      <div class="flex flex-wrap gap-2">
        <button class="status-chip" [class.status-chip-on]="!statusFilter"
                (click)="setStatus('')">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          All
          @if (!statusFilter) {
            <span class="chip-badge">{{ total() }}</span>
          }
        </button>

        <button class="status-chip status-chip-selected" [class.status-chip-on]="statusFilter === 'selected'"
                (click)="setStatus('selected')">
          <span class="chip-dot" style="background:#22c55e"></span>
          {{ 'NAV.SELECTED' | translate }}
          @if (statusFilter === 'selected') {
            <span class="chip-badge chip-badge-selected">{{ total() }}</span>
          }
        </button>

        <button class="status-chip status-chip-pending" [class.status-chip-on]="statusFilter === 'pending'"
                (click)="setStatus('pending')">
          <span class="chip-dot" style="background:#f59e0b"></span>
          {{ 'NAV.PENDING' | translate }}
          @if (statusFilter === 'pending') {
            <span class="chip-badge chip-badge-pending">{{ total() }}</span>
          }
        </button>

        <button class="status-chip status-chip-rejected" [class.status-chip-on]="statusFilter === 'rejected'"
                (click)="setStatus('rejected')">
          <span class="chip-dot" style="background:#f43f5e"></span>
          {{ 'NAV.REJECTED' | translate }}
          @if (statusFilter === 'rejected') {
            <span class="chip-badge chip-badge-rejected">{{ total() }}</span>
          }
        </button>

        @if (auth.isAdmin()) {
          <button class="status-chip status-chip-observed" [class.status-chip-on]="statusFilter === 'observed'"
                  (click)="setStatus('observed')">
            <span class="chip-dot" style="background:#8b5cf6"></span>
            {{ 'NAV.OBSERVED' | translate }}
            @if (statusFilter === 'observed') {
              <span class="chip-badge">{{ total() }}</span>
            }
          </button>

          <!-- بُعد فلترة مختلف عن الحالة (كوتش فاضي، مش status) — فمفصول ببوردر
               عشان مايتقريش كأنه رابع chip حالة. أدمن-فقط: الباكإند بيشيل عدسة
               الـcoach أصلاً لأي دور تاني (PLAYER_ADMIN_ONLY_LENSES). -->
          <span aria-hidden="true" style="width:1px;align-self:stretch;background:var(--border-color);margin:0 2px"></span>
          <button class="status-chip status-chip-orphaned" [class.status-chip-on]="orphanedOnly()"
                  data-testid="orphaned-filter"
                  [attr.aria-pressed]="orphanedOnly()"
                  (click)="toggleOrphaned()">
            <span class="chip-dot" style="background:#f59e0b"></span>
            {{ 'PLAYERS.NO_COACH' | translate }}
            @if (orphanedOnly()) {
              <span class="chip-badge">{{ total() }}</span>
            }
          </button>

          <!-- specs/006-admin-professional-lens — Stage 4c. Gap-fix, not part
               of the original scout-pro plan: Stage 4b left professional
               players with no ageGroup at all, so they had no card and no
               search route on this page. This chip is their only intentional
               route (FR-007/FR-008), admin-only (FR-010) since proScout's
               entire scope is already professional. -->
          <button class="status-chip status-chip-professional" [class.status-chip-on]="professionalOnly()"
                  data-testid="professional-filter"
                  [attr.aria-pressed]="professionalOnly()"
                  (click)="toggleProfessional()">
            <span class="chip-dot" style="background:#38bdf8"></span>
            {{ 'PLAYERS.PROFESSIONAL_LEAGUE' | translate }}
            <!-- FR-011 — inverted vs. every badge above: those show a count
                 while their OWN chip is active (echoing the current total).
                 This one shows while the chip is INACTIVE — i.e. while the
                 grid is visible — so the admin sees, on the grid itself, the
                 count the cards don't include (header total = Σ cards + this). -->
            @if (!professionalOnly() && professionalCount() > 0) {
              <span class="chip-badge">{{ professionalCount() }}</span>
            }
          </button>
        }
      </div>
      }

      <!-- ═══════════ AGE GROUPS VIEW (default) ═══════════ -->
      @if (!selectedGroup() && !flatView()) {

        @if (loadingGroups() || countsLoading()) {
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <app-skeleton-loader type="card" [count]="8" />
          </div>
        } @else if (visibleGroups().length === 0) {
          <div class="text-center py-14" style="color:var(--text-muted)">
            <svg class="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            <p class="text-sm">{{ 'PLAYERS.NO_GROUPS_STATUS' | translate }}</p>
          </div>
        } @else {
          <p class="text-sm" style="color:var(--text-secondary)">{{ 'PLAYERS.PICK_GROUP' | translate }}</p>

          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <!-- observer-matches-and-players — a professional-league card alongside the
                 age-group ones, entered the same way as any age-group card, before adding
                 a player. Admin keeps its existing chip-based route into this lens
                 (Principle III, unchanged); this card is additive for observer only. -->
            @if (auth.isObserver()) {
              <button type="button"
                      class="relative overflow-hidden rounded-2xl text-left group/card age-group-card age-group-card--professional"
                      [attr.aria-label]="('PLAYERS.PROFESSIONAL_LEAGUE' | translate)"
                      (click)="toggleProfessional()">
                <div style="position:absolute;top:-24px;inset-inline-end:-20px;width:96px;height:96px;border-radius:50%;
                            filter:blur(28px);pointer-events:none;background:rgba(251,191,36,0.28);
                            opacity:0.75;transition:opacity 0.2s"
                     class="group-hover/card:opacity-100"></div>

                <div class="flex items-center justify-center rounded-xl mb-4"
                     style="width:42px;height:42px;background:rgba(251,191,36,0.22);position:relative">
                  <svg style="width:20px;height:20px;color:#fbbf24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/>
                  </svg>
                </div>

                <p class="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style="color:#fcd34d">
                  {{ 'PLAYERS.PROFESSIONAL_LEAGUE' | translate }}
                </p>
                <p class="text-2xl font-black tabular-nums leading-none" style="color:var(--text-primary)">—</p>

                <div class="flex items-center gap-1.5 mt-3">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums"
                        style="background:rgba(251,191,36,0.22);color:#fbbf24">
                    {{ professionalCount() }}
                    <span class="font-medium opacity-90">{{ 'PLAYERS.PLAYERS_WORD' | translate }}</span>
                  </span>
                </div>
              </button>
            }
            @for (g of visibleGroups(); track g._id) {
              @if ((groupCounts()[g._id] ?? 0) > 0) {
                <!-- Populated group — vivid accent, glow, pulsing "has players" dot -->
                <button type="button"
                        class="relative overflow-hidden rounded-2xl text-left group/card age-group-card age-group-card--populated"
                        [attr.aria-label]="(g.birthYear + ' — ' + (groupCounts()[g._id] ?? 0)) + ' ' + ('PLAYERS.PLAYERS_WORD' | translate)"
                        (click)="selectGroup(g)">

                  <!-- Ambient glow -->
                  <div style="position:absolute;top:-24px;inset-inline-end:-20px;width:96px;height:96px;border-radius:50%;
                              filter:blur(28px);pointer-events:none;background:rgba(56,189,248,0.28);
                              opacity:0.75;transition:opacity 0.2s"
                       class="group-hover/card:opacity-100"></div>

                  <!-- "Has players" indicator dot (color + shape, not color alone) -->
                  <span class="age-group-pulse-dot" style="position:absolute;top:14px;inset-inline-end:14px;width:8px;height:8px;border-radius:50%;background:#38bdf8"
                        aria-hidden="true"></span>

                  <!-- Icon -->
                  <div class="flex items-center justify-center rounded-xl mb-4"
                       style="width:42px;height:42px;background:rgba(56,189,248,0.22);position:relative">
                    <svg style="width:20px;height:20px;color:#38bdf8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>

                  <!-- Birth year -->
                  <p class="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style="color:#7dd3fc">
                    {{ 'PLAYERS.BIRTH_YEAR' | translate }}
                  </p>
                  <p class="text-2xl font-black tabular-nums leading-none" style="color:var(--text-primary)">{{ g.birthYear }}</p>

                  <!-- Count -->
                  <div class="flex items-center gap-1.5 mt-3">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums"
                          style="background:rgba(56,189,248,0.22);color:#38bdf8">
                      {{ groupCounts()[g._id] ?? 0 }}
                      <span class="font-medium opacity-90">{{ 'PLAYERS.PLAYERS_WORD' | translate }}</span>
                    </span>
                  </div>
                </button>
              } @else {
                <!-- Empty group — muted/neutral so populated groups stand out at a glance -->
                <button type="button"
                        class="relative overflow-hidden rounded-2xl text-left group/card age-group-card age-group-card--empty"
                        [attr.aria-label]="(g.birthYear + ' — ' + ('PLAYERS.NO_PLAYERS_YET' | translate))"
                        (click)="selectGroup(g)">

                  <!-- Icon -->
                  <div class="flex items-center justify-center rounded-xl mb-4"
                       style="width:42px;height:42px;background:rgba(148,163,184,0.12)">
                    <svg style="width:20px;height:20px;color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </div>

                  <!-- Birth year -->
                  <p class="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style="color:var(--text-muted)">
                    {{ 'PLAYERS.BIRTH_YEAR' | translate }}
                  </p>
                  <p class="text-2xl font-black tabular-nums leading-none" style="color:var(--text-secondary)">{{ g.birthYear }}</p>

                  <!-- Count -->
                  <div class="flex items-center gap-1.5 mt-3">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium tabular-nums"
                          style="background:rgba(148,163,184,0.12);color:var(--text-muted)">
                      {{ 'PLAYERS.NO_PLAYERS_YET' | translate }}
                    </span>
                  </div>
                </button>
              }
            }
          </div>
        }
      }

      <!-- ═══════════ PLAYERS VIEW (a group is selected, or groups are skipped entirely) ═══════════ -->
      @if (selectedGroup() || flatView()) {

      <!-- Back to groups + selected group banner (only when a specific age group is chosen) -->
      @if (selectedGroup()) {
        <div class="flex items-center gap-3">
          <button type="button" class="btn btn-secondary btn-sm" (click)="backToGroups()">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            {{ 'PLAYERS.ALL_GROUPS' | translate }}
          </button>
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg"
               style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.25)">
            <svg style="width:14px;height:14px;color:#38bdf8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            <span class="text-sm font-bold tabular-nums" style="color:#38bdf8">{{ 'PLAYERS.BIRTH_YEAR' | translate }} {{ selectedGroup()!.birthYear }}</span>
          </div>
        </div>
      }

      <!-- ── Search + Position filter ── -->
      <div class="card overflow-hidden" style="padding:0">
        <div class="flex flex-wrap items-stretch" style="gap:0">

          <!-- Search input -->
          <div class="flex items-center flex-1 px-4 gap-3" style="min-width:200px;border-inline-end:1px solid var(--border-color)">
            <svg style="width:16px;height:16px;flex-shrink:0;color:var(--text-muted)"
                 fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input [(ngModel)]="keyword" (ngModelChange)="onKeywordChange($event)" type="text"
                   [placeholder]="'PLAYERS.SEARCH_PH' | translate"
                   style="flex:1;background:transparent;border:none;outline:none;padding:14px 0;
                          font-size:14px;color:var(--text-primary);min-width:0" />
            @if (keyword) {
              <button (click)="clearKeyword()" title="Clear"
                      style="background:none;border:none;cursor:pointer;padding:2px;display:flex;color:var(--text-muted);flex-shrink:0;transition:color 0.15s"
                      onmouseenter="this.style.color='var(--text-primary)'" onmouseleave="this.style.color='var(--text-muted)'">
                <svg style="width:14px;height:14px" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            }
          </div>

          <!-- Position select -->
          <div class="flex items-center px-4 gap-3" style="border-inline-end:1px solid var(--border-color)">
            <svg style="width:14px;height:14px;flex-shrink:0;color:var(--text-muted)"
                 fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
            <select [(ngModel)]="positionFilter" (ngModelChange)="resetAndLoad()"
                    style="background:transparent;border:none;outline:none;padding:14px 0;
                           font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer;min-width:120px">
              <option value="" style="background:var(--bg-card)">{{ 'PLAYERS.ALL_POSITIONS' | translate }}</option>
              @for (p of positions; track p.value) {
                <option [value]="p.value" style="background:var(--bg-card)">{{ p.label }}</option>
              }
            </select>
          </div>

          <!-- specs/006-admin-professional-lens PC-2 — team filter scoped to
               professional-league teams, shown only while this lens is
               active. Convenience over the server-side isProfessional filter
               (D-1/Principle I): choosing a non-professional team here would
               simply return nothing, it cannot widen what the lens shows. -->
          @if (professionalOnly()) {
            <div class="flex items-center px-4 gap-3" style="border-inline-end:1px solid var(--border-color)">
              <svg style="width:14px;height:14px;flex-shrink:0;color:var(--text-muted)"
                   fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <select [(ngModel)]="teamFilter" (ngModelChange)="resetAndLoad()"
                      data-testid="professional-team-filter"
                      style="background:transparent;border:none;outline:none;padding:14px 0;
                             font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer;min-width:140px">
                <option value="" style="background:var(--bg-card)">{{ 'PLAYERS.ALL_TEAMS' | translate }}</option>
                @for (t of professionalTeams(); track t._id) {
                  <option [value]="t._id" style="background:var(--bg-card)">{{ t.name }}</option>
                }
              </select>
            </div>
          }

        </div>
      </div>

      <!-- ── Player grid ── -->
      @if (loading()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <app-skeleton-loader type="card" [count]="6" />
        </div>
      } @else if (players().length === 0) {
        <app-empty-state
          [title]="'PLAYERS.EMPTY_TITLE' | translate"
          [message]="keyword ? ('PLAYERS.EMPTY_SEARCH' | translate) : ('PLAYERS.EMPTY_FIRST' | translate)"
          [actionLabel]="(auth.isCoach() || auth.isProScout() || auth.isObserver()) && !keyword ? ('PLAYERS.ADD' | translate) : null"
          (actionClicked)="goToNewPlayer()"
          icon="players"
        />
      } @else {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          @for (player of players(); track player._id) {

            <div class="card overflow-hidden cursor-pointer group hover-scale"
                 style="--hover-scale:1.016"
                 (click)="goToPlayer(player._id)">

              <!-- Status-based gradient header -->
              <div class="relative px-5 pt-5 pb-4 overflow-hidden"
                   [style]="'background:' + (
                     player.status === 'selected' ? 'linear-gradient(145deg,rgba(34,197,94,0.20) 0%,rgba(16,185,129,0.07) 100%)' :
                     player.status === 'rejected' ? 'linear-gradient(145deg,rgba(244,63,94,0.20) 0%,rgba(239,68,68,0.07) 100%)' :
                     player.status === 'observed' ? 'linear-gradient(145deg,rgba(139,92,246,0.20) 0%,rgba(109,40,217,0.07) 100%)' :
                                                    'linear-gradient(145deg,rgba(245,158,11,0.20) 0%,rgba(234,179,8,0.07) 100%)')">

                <!-- Ambient glow -->
                <div style="position:absolute;top:-30px;right:-15px;width:110px;height:110px;border-radius:50%;filter:blur(30px);pointer-events:none;opacity:0.7"
                     [style.background]="player.status === 'selected' ? 'rgba(34,197,94,0.15)' : player.status === 'rejected' ? 'rgba(244,63,94,0.15)' : player.status === 'observed' ? 'rgba(139,92,246,0.15)' : 'rgba(245,158,11,0.15)'">
                </div>

                <div class="flex items-center gap-4">

                  <!-- Avatar / Jersey -->
                  <div class="relative flex-shrink-0">
                    <div class="rounded-2xl flex items-center justify-center font-black text-white overflow-hidden"
                         style="width:68px;height:68px;font-size:26px;box-shadow:0 8px 22px rgba(0,0,0,0.35)"
                         [style.background]="player.status === 'selected' ? 'linear-gradient(135deg,#059669,#22c55e)' : player.status === 'rejected' ? 'linear-gradient(135deg,#be123c,#f43f5e)' : player.status === 'observed' ? 'linear-gradient(135deg,#6d28d9,#8b5cf6)' : 'linear-gradient(135deg,#b45309,#f59e0b)'">
                      @if (player.profileImg) {
                        <img [src]="player.profileImg" [alt]="player.name" class="w-full h-full object-cover" loading="lazy"
                             [style.cursor]="auth.isAdmin() ? 'zoom-in' : null"
                             (click)="auth.isAdmin() && openAvatar($event, player.profileImg, player.name)" />
                      } @else {
                        {{ initials(player.name) }}
                      }
                    </div>
                    <!-- Position micro-badge -->
                    @if (player.position) {
                      <span class="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded text-white font-bold leading-none"
                            style="font-size:9px;background:rgba(15,23,42,0.85);border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(4px)">
                        {{ player.position }}
                      </span>
                    }
                  </div>

                  <!-- Identity -->
                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-base truncate leading-tight" style="color:var(--text-primary)">{{ player.name }}</p>

                    <!-- Meta: team/nationality on one line, coach on its own line — one icon language, one size, throughout -->
                    <p class="text-xs truncate mt-1 flex items-center gap-1.5" style="color:var(--text-secondary)">
                      <svg class="w-3 h-3 flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      <span class="truncate">
                        @if (teamName(player)) {
                          {{ teamName(player) }} <span style="color:var(--text-muted)">·</span> {{ player.nationality }}
                        } @else {
                          {{ player.nationality }}
                        }
                      </span>
                    </p>
                    @if (coachName(player)) {
                      <p class="text-xs truncate mt-1 flex items-center gap-1.5" style="color:var(--text-secondary)">
                        <svg class="w-3 h-3 flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                        <span class="truncate">{{ coachName(player) }}</span>
                      </p>
                    } @else if (isOrphaned(player)) {
                      <!-- كوتش اللاعب اتحذف نهائياً — بيتعرض للأدمن بس، لأنه الوحيد اللي
                           بيشوف حقل الكوتش أصلاً وهو الوحيد اللي يقدر يعيّن واحد جديد -->
                      <p class="text-xs truncate mt-1 flex items-center gap-1.5" style="color:#f59e0b">
                        <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                          <line x1="17" y1="5" x2="23" y2="11"/><line x1="23" y1="5" x2="17" y2="11"/>
                        </svg>
                        <span class="truncate">{{ 'PLAYERS.NO_COACH' | translate }}</span>
                      </p>
                    }
                    <!-- specs/010-professional-lens-creator — who added this player, admin-only,
                         only inside the Professional League lens (Stage 4c's flat view). -->
                    @if (professionalOnly() && auth.isAdmin() && creatorName(player)) {
                      <p class="text-xs truncate mt-1 flex items-center gap-1.5" style="color:var(--text-secondary)">
                        <svg class="w-3 h-3 flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                          <path d="M12 5v14M5 12h14"/>
                        </svg>
                        <span class="truncate">{{ 'PLAYERS.CREATED_BY' | translate }}: {{ creatorName(player) }}</span>
                      </p>
                    }
                    <!-- Status badge -->
                    <div class="mt-2">
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                            [style]="player.status === 'selected'
                              ? 'background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.28)'
                              : player.status === 'rejected'
                              ? 'background:rgba(244,63,94,0.15);color:#fb7185;border:1px solid rgba(244,63,94,0.28)'
                              : player.status === 'observed'
                              ? 'background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.28)'
                              : 'background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.28)'">
                        <span class="w-1.5 h-1.5 rounded-full"
                              [style.background]="player.status === 'selected' ? '#22c55e' : player.status === 'rejected' ? '#f43f5e' : player.status === 'observed' ? '#8b5cf6' : '#f59e0b'">
                        </span>
                        {{ player.status | titlecase }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Stats strip -->
              <div class="grid grid-cols-3 text-center py-3.5 px-2" style="border-top:1px solid var(--border-subtle)">
                <div class="flex flex-col items-center gap-0.5"
                     style="border-inline-end:1px solid var(--border-subtle)">
                  <span class="text-base font-extrabold tabular-nums leading-none" style="color:var(--accent)">
                    {{ calcAge(player.dateOfBirth) }}
                  </span>
                  <span class="text-[10px] font-semibold uppercase tracking-widest" style="color:var(--text-muted)">AGE</span>
                </div>

                <div class="flex flex-col items-center gap-0.5"
                     style="border-inline-end:1px solid var(--border-subtle)">
                  <span class="text-base font-extrabold leading-none capitalize" style="color:#38bdf8">
                    {{ player.preferredFoot ? player.preferredFoot[0].toUpperCase() : '—' }}
                  </span>
                  <span class="text-[10px] font-semibold uppercase tracking-widest" style="color:var(--text-muted)">FOOT</span>
                </div>

                <div class="flex flex-col items-center gap-0.5">
                  <span class="text-base font-extrabold tabular-nums leading-none" [style.color]="ratingColor(avgRating(player._id))">
                    {{ avgRating(player._id) ?? '—' }}
                  </span>
                  <span class="text-[10px] font-semibold uppercase tracking-widest" style="color:var(--text-muted)">{{ 'PLAYERS.AVG_RATING' | translate }}</span>
                </div>
              </div>

              <!-- Hover actions footer -->
              <div class="flex items-center justify-between px-4 py-2.5 opacity-0 group-hover:opacity-100 transition-all duration-200"
                   style="border-top:1px solid var(--border-subtle);background:rgba(255,255,255,0.025)"
                   (click)="$event.stopPropagation()">
                <a [routerLink]="['/players', player._id, 'reports']" [queryParams]="observerFilter ? { authorRole: 'observer' } : {}"
                   class="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                   style="color:var(--accent)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {{ 'PLAYERS.VIEW_REPORTS' | translate }}
                </a>
                <div class="flex gap-1">
                  @if (auth.isCoach() || auth.isObserver()) {
                    <a [routerLink]="['/players', player._id, 'edit']"
                       class="btn btn-ghost btn-icon btn-sm" title="Edit">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </a>
                  }
                  <!-- observer-matches-and-players — was "@if (!auth.isCoach())", so an
                       observer saw a delete button the backend has always rejected
                       (DELETE /players/:id is admin-only). Corrected to the role that
                       can actually delete, now that observer is a real write-capable role. -->
                  @if (auth.isAdmin()) {
                    <button class="btn btn-ghost btn-icon btn-sm" style="color:#f43f5e" title="Delete"
                            (click)="confirmDelete(player)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  }
                </div>
              </div>

            </div>
          }
        </div>

        <!-- Pagination -->
        @if (pagination() && pagination()!.numberOfPages > 1) {
          <div class="flex items-center justify-between pt-2">
            <p class="text-sm" style="color:var(--text-muted)">
              Page <span class="font-semibold tabular-nums" style="color:var(--text-primary)">{{ pagination()!.currentPage }}</span>
              of <span class="font-semibold tabular-nums" style="color:var(--text-primary)">{{ pagination()!.numberOfPages }}</span>
            </p>
            <div class="flex items-center gap-2">
              <button class="btn btn-secondary btn-sm" [disabled]="currentPage() === 1"
                      (click)="changePage(currentPage() - 1)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                {{ 'PLAYERS.PREV' | translate }}
              </button>
              <button class="btn btn-secondary btn-sm" [disabled]="currentPage() === pagination()!.numberOfPages"
                      (click)="changePage(currentPage() + 1)">
                {{ 'PLAYERS.NEXT' | translate }}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </div>
        }
      }

      }
      <!-- ═══════════ END PLAYERS VIEW ═══════════ -->
    </div>

    @if (deleteTarget()) {
      <app-confirm-dialog
        [title]="'PLAYERS.DELETE_TITLE' | translate"
        [message]="'PLAYERS.DELETE_MSG' | translate:{name: deleteTarget()!.name}"
        confirmLabel="Delete"
        [danger]="true"
        (confirmed)="doDelete()"
        (cancelled)="deleteTarget.set(null)"
      />
    }

    <app-image-lightbox [src]="lightboxSrc()" [alt]="lightboxAlt()" (closed)="closeLightbox()" />
  `,
  styles: [`
    /* audit-frontend P5 — الستايل ده كان مكتوب inline على الزرار، والـhover كان
       (mouseenter) في التمبليت بيعدّل .style مباشرةً.
       نقله للكلاس **مش تنسيق** — هو شرط لازم عشان :hover يشتغل أصلاً: الستايل
       الـinline أعلى أولوية من أي قاعدة في الستايل شيت، فقاعدة :hover على
       border-color أو opacity مكانتش هتقدر تكتب فوق border/opacity المكتوبين
       inline. */
    .age-group-card {
      padding: 20px;
      cursor: pointer;
      transition: transform 0.18s cubic-bezier(0.16,1,0.3,1),
                  box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
    }
    /* فيها لاعبين — لون واضح وتوهّج */
    .age-group-card--populated {
      background: linear-gradient(150deg, rgba(56,189,248,0.14) 0%, rgba(139,92,246,0.07) 100%);
      border: 1px solid rgba(56,189,248,0.35);
    }
    .age-group-card--populated:hover {
      transform: translateY(-3px);
      border-color: rgba(56,189,248,0.55);
      box-shadow: 0 12px 30px rgba(56,189,248,0.22);
    }
    /* فاضية — باهتة عشان اللي فيها لاعبين تبان من نظرة */
    .age-group-card--empty {
      background: var(--bg-card);
      border: 1px dashed var(--border-color);
      opacity: 0.72;
    }
    .age-group-card--empty:hover {
      transform: translateY(-2px);
      opacity: 0.9;
    }
    /* observer-matches-and-players — gold accent so the professional card reads
       as its own category at a glance, not a stray age-group card. */
    .age-group-card--professional {
      background: linear-gradient(150deg, rgba(251,191,36,0.14) 0%, rgba(217,119,6,0.07) 100%);
      border: 1px solid rgba(251,191,36,0.35);
    }
    .age-group-card--professional:hover {
      transform: translateY(-3px);
      border-color: rgba(251,191,36,0.55);
      box-shadow: 0 12px 30px rgba(251,191,36,0.22);
    }
    .age-group-pulse-dot {
      animation: ageGroupPulse 2s ease-in-out infinite;
    }
    @keyframes ageGroupPulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(56,189,248,0.5); }
      50% { opacity: 0.7; box-shadow: 0 0 0 4px rgba(56,189,248,0); }
    }
    @media (prefers-reduced-motion: reduce) {
      .age-group-pulse-dot { animation: none; }
    }
    .age-group-card:focus-visible {
      outline: 2px solid #38bdf8;
      outline-offset: 2px;
    }
  `]
})
export class PlayerListComponent implements OnInit {
  readonly playerService = inject(PlayerService);
  readonly reportService = inject(ScoutingReportService);
  private readonly teamService = inject(TeamService);
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  readonly players = signal<Player[]>([]);
  readonly loading = signal(true);
  readonly total = signal(0);
  readonly lightboxSrc = signal<string | null>(null);
  readonly lightboxAlt = signal('');
  // متوسط overallRating بتاع كل لاعب ظاهر في الصفحة الحالية — playerId → overallRating
  readonly avgRatings = signal<Record<string, number>>({});
  readonly pagination = signal<Pagination | null>(null);
  readonly currentPage = signal(1);
  readonly deleteTarget = signal<Player | null>(null);

  // Age-group view state
  readonly ageGroups = signal<AgeGroup[]>([]);
  readonly loadingGroups = signal(true);
  readonly countsLoading = signal(false);
  readonly selectedGroup = signal<AgeGroup | null>(null);
  readonly groupCounts = signal<Record<string, number | undefined>>({});
  // Stage 4c (FR-011) — count of professional players within scope, shown on
  // the chip while the grid is visible so header total = Σ cards + this.
  readonly professionalCount = signal(0);
  // Skip the "pick an age group" step entirely and show a flat player list —
  // used when an observer views their own assigned players, or when the admin
  // opens "View Assigned Players" for a specific observer (?observer=id).
  readonly flatView = signal(false);

  // لما نيجي من صفحة أوبزيرفر معين (?observer=id) عايزين نفتح على طول على فلتر الأوبزيرفر في صفحة الريبورتس
  goToPlayer(playerId: string): void {
    const queryParams = this.observerFilter ? { authorRole: 'observer' } : {};
    this.router.navigate(['/players', playerId], { queryParams });
  }

  // observer-matches-and-players — empty-state's action button, unlike the header's
  // routerLink, navigates imperatively — same context=professional hint applies.
  goToNewPlayer(): void {
    this.router.navigate(['/players/new'], {
      queryParams: this.professionalOnly() ? { context: 'professional' } : {},
    });
  }

  openAvatar(event: Event, url: string, name: string): void {
    event.stopPropagation();
    this.lightboxSrc.set(url);
    this.lightboxAlt.set(name);
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
  }

  // Only groups that have players matching the active status (all groups when no status filter)
  visibleGroups(): AgeGroup[] {
    const groups = this.ageGroups();
    if (!this.statusFilter) return groups;
    const counts = this.groupCounts();
    return groups.filter(g => (counts[g._id] ?? 0) > 0);
  }

  private readonly destroyRef = inject(DestroyRef);

  // audit-frontend P6 — كل عمليات تحميل الليستة بتعدّي من هنا (شوف
  // wireLoadPipeline تحت). Subject منفصل للكتابة عشان هي الوحيدة المتأخّرة.
  private readonly reload$ = new Subject<void>();
  private readonly keywordInput$ = new Subject<string>();

  keyword = '';
  positionFilter: PlayerPosition | '' = '';
  statusFilter: PlayerStatus | '' = '';
  coachFilter = '';
  observerFilter = '';
  // Stage 4c (PC-2) — team dropdown scoped to the professional lens only.
  // Convenience over the server-side isProfessional filter (D-1), never the
  // thing that confines the result: a non-professional team id here would
  // simply return nothing under the active isProfessional=true condition.
  teamFilter = '';
  readonly professionalTeams = signal<Team[]>([]);
  private professionalTeamsLoaded = false;

  readonly positions = PLAYER_POSITIONS;

  private pendingGroupId = '';

  professionalFilter = '';

  ngOnInit(): void {
    this.wireLoadPipeline();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(qp => {
      this.statusFilter = (qp.get('status') as PlayerStatus | null) ?? '';
      this.coachFilter = qp.get('coach') ?? '';
      this.observerFilter = qp.get('observer') ?? '';
      this.positionFilter = (qp.get('position') as PlayerPosition | null) ?? '';
      this.pendingGroupId = qp.get('ageGroup') ?? '';
      // Stage 4c — عدسة "دوري المحترفين" للأدمن. isProfessional بتتقرا زي
      // أي بارام تاني في الـURL، نفس نمط coachFilter/observerFilter.
      this.professionalFilter = qp.get('isProfessional') ?? '';
      this.currentPage.set(1);
      this.resolveView();
    });
    this.loadGroups();
  }

  // §9 — عدسة اللاعبين اليتامى (كوتشهم اتمسح). السنتينل بيتبعت كـ?coach=none
  // وبيتترجم في الباكإند لـ{coach: null}. coachFilter أصلاً بيتقرا من نفس الـ
  // query param فمفيش حالة جديدة محتاجة تتخزّن.
  orphanedOnly(): boolean {
    return this.coachFilter === 'none';
  }

  // Stage 4c — عدسة "دوري المحترفين". isProfessional=true بيفتح flat view
  // فيها كل لاعبي المحترفين، بنفس نمط orphanedOnly() فوق.
  professionalOnly(): boolean {
    return this.professionalFilter === 'true';
  }

  // specs/006-admin-professional-lens PC-1 — الاتنين (بدون كوتش، ودوري
  // المحترفين) بيبدأوا الـview نضيف تماماً عند أي ضغطة، مش دمج. ده تغيير سلوك
  // متعمّد على toggleOrphaned() القائم (بالتنسيق مع المالك)، مش أثر جانبي:
  // كانت queryParamsHandling: 'merge' بتسيب status/position/keyword شغالين.
  // navigate() من غير queryParamsHandling = استبدال كامل (سلوك Angular
  // الافتراضي)، وkeyword بيتصفّر يدوي لأنه عايش بره الـURL أصلاً فمفيش
  // navigation بيلمسه لوحده.
  toggleOrphaned(): void {
    this.keyword = '';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.orphanedOnly() ? {} : { coach: 'none' },
    });
  }

  toggleProfessional(): void {
    this.keyword = '';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.professionalOnly() ? {} : { isProfessional: 'true' },
    });
  }

  // Observer viewing their own players, or admin viewing a specific observer's players —
  // in both cases skip the age-group picker and show a flat list directly.
  //
  // اليتامى كمان بيتعرضوا flat: هما ممتدين على كل الفئات العمرية والمقصود منهم
  // إنهم يتلمّوا عشان يتعيّنلهم كوتش، مش يتصفّحوا فئة فئة. وكمان endpoint الـ
  // counts بيتجاهل أي coach مش ObjectId صالح، فشبكة الفئات كانت هتوري أعداد كل
  // اللاعبين بدل اليتامى — الـflat view بيتخطّاها تماماً فمفيش تضارب.
  //
  // Stage 4 (FR-002) — proScout joins this list. The role has no age-group
  // dimension at all: its scope is "professional-league teams + its own team-less
  // players", which cuts across every birth year. Routing it through the existing
  // flat-list path is the whole of FR-002 — no parallel template, no per-element
  // @if, and it reuses a code path that already has test coverage.
  //
  // observer-matches-and-players — auth.isObserver() removed from this list.
  // Observer now gets the same age-group grid a coach sees (plus the professional
  // card above), instead of always skipping straight to a flat list — that flat
  // list stays for the admin's "?observer=<id>" lens (observerFilter, unchanged)
  // and for orphaned/professional, which are still flat views for every role.
  private skipGroupsView(): boolean {
    return !!this.observerFilter || this.auth.isProScout() || this.orphanedOnly() || this.professionalOnly();
  }

  // Decide which view to show based on the ageGroup query param
  private resolveView(): void {
    if (this.pendingGroupId) {
      // Players view (scoped to a group)
      const g = this.ageGroups().find(x => x._id === this.pendingGroupId) ?? null;
      this.selectedGroup.set(g);
      this.flatView.set(false);
      this.load();
    } else if (this.skipGroupsView()) {
      this.selectedGroup.set(null);
      this.flatView.set(true);
      if (this.professionalOnly()) this.loadProfessionalTeams();
      this.load();
    } else {
      // Groups view — reload per-group counts for the active status
      this.selectedGroup.set(null);
      this.flatView.set(false);
      this.players.set([]);
      if (this.ageGroups().length) this.loadGroupCounts(this.ageGroups());
    }
  }

  loadGroups(): void {
    // Stage 4 (FR-002) — proScout never renders the age-group grid, so it must not
    // fetch age groups either. Hiding a grid while still requesting the data behind
    // it is theatre; the role simply has no business consuming this category.
    //
    // Backend audit fix S2 (constitution v1.3.0, C-3) closed
    // TODO(AGES_UNAUTHENTICATED_READ): GET /ages now carries `protect` +
    // `allowedTo(admin, coach, observer)` and denies proScout with 403. This
    // early-return stays as the primary guard regardless — a proScout browser
    // simply has no business requesting this category, 403 or not.
    if (this.auth.isProScout()) {
      this.loadingGroups.set(false);
      this.resolveView();
      return;
    }

    this.loadingGroups.set(true);
    this.http.get<PaginatedResponse<{ documents: AgeGroup[] }>>(`${environment.apiUrl}/ages`).subscribe({
      next: res => {
        const groups = ((res.data as any)?.documents ?? (res.data as any)?.ageGroups ?? [])
          .slice()
          .sort((a: AgeGroup, b: AgeGroup) => b.birthYear - a.birthYear);
        this.ageGroups.set(groups);
        this.loadingGroups.set(false);
        // Now that groups are available, resolve the view (loads counts or the banner group)
        this.resolveView();
      },
      error: () => this.loadingGroups.set(false),
    });
  }

  // Stage 4c (D-4) — fetched once on first activation of the lens, not per
  // keystroke. Same call player-form.component.ts already makes for the
  // proScout team picker, so no new service surface.
  private loadProfessionalTeams(): void {
    if (this.professionalTeamsLoaded) return;
    this.professionalTeamsLoaded = true;
    this.teamService.getAll(undefined, 'professional').subscribe({
      next: res => this.professionalTeams.set(res.data?.documents ?? []),
      error: () => this.professionalTeams.set([]),
    });
  }

  private loadGroupCounts(groups: AgeGroup[]): void {
    if (groups.length === 0) return;
    this.countsLoading.set(true);
    // Single aggregation request → { counts: { ageGroupId: n }, total }
    // (coach/observer scope the counts when the admin is browsing a specific coach's or observer's players)
    this.playerService.countsByAgeGroup(this.statusFilter, this.coachFilter, this.observerFilter).subscribe({
      next: res => {
        const counts = res.data?.counts ?? {};
        this.groupCounts.set(counts);
        if (!this.selectedGroup()) this.total.set(res.data?.total ?? 0);
        // Stage 4c (FR-011) — rides the same request as the age-group buckets,
        // so it honours the same status/coach/observer conditions by
        // construction (FR-006), not a separately-maintained call.
        this.professionalCount.set(res.data?.professional ?? 0);
        this.countsLoading.set(false);
      },
      error: () => this.countsLoading.set(false),
    });
  }

  selectGroup(g: AgeGroup): void {
    // Real navigation → view is driven by the ageGroup query param (status/filters preserved)
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ageGroup: g._id },
      queryParamsHandling: 'merge',
    });
  }

  backToGroups(): void {
    this.keyword = '';
    // Drop only the ageGroup param, keep the active status filter
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ageGroup: null },
      queryParamsHandling: 'merge',
    });
  }

  // audit-frontend P6 — الفلاتر بتتقرا من الكومبوننت **وقت الطلب**، مش بتتبعت مع
  // الـtrigger. يعني أي إشارة إعادة تحميل بتستخدم أحدث حالة موجودة، ومفيش فرصة
  // لطلب يتنفّذ بفلاتر قديمة.
  private currentFilters(): PlayerFilters {
    return {
      page: this.currentPage(),
      limit: 20,
      keyword: this.keyword || undefined,
      position: this.positionFilter || undefined,
      status: this.statusFilter || undefined,
      coach: this.coachFilter || undefined,
      observer: this.observerFilter || undefined,
      ageGroup: this.pendingGroupId || this.selectedGroup()?._id || undefined,
      isProfessional: this.professionalOnly() ? 'true' : undefined,
      team: this.professionalOnly() ? (this.teamFilter || undefined) : undefined,
    };
  }

  // audit-frontend P6 — خط أنابيب واحد لكل عمليات التحميل.
  //
  // switchMap هو **إصلاح صحة، مش أداء**: قبله كل نداء load() كان بيفتح اشتراك
  // مستقل، والمعروض في الآخر هو **آخر رد بيوصل** مش آخر بحث اتعمل. على شبكة
  // بتخلط ترتيب الردود، المستخدم يكتب "mohamed" ويتفرّج على نتايج "moh" — بيانات
  // غلط معروضة كأنها صح. switchMap بيلغي الطلب السابق فآخر بحث هو الوحيد اللي
  // بيوصل للشاشة.
  //
  // ونداء المتوسطات **جوه** نفس الخط عن قصد: كان بيتنده من داخل next بتاع
  // getAll، يعني اشتراك تاني بيتسابق لوحده — متوسطات ليستة قديمة كانت تقدر
  // تكتب فوق متوسطات الليستة الجديدة حتى لو الليستة نفسها طلعت صح.
  //
  // catchError على كل طلب داخلي لوحده: الخطأ بيموّت الأوبزرفابل اللي بيحصل فيه،
  // فلو حطيناه على الخط الخارجي أول فشل شبكة كان هيوقف البحث للأبد.
  private wireLoadPipeline(): void {
    this.reload$
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(() =>
          this.playerService.getAll(this.currentFilters()).pipe(
            catchError(() => { this.loading.set(false); return EMPTY; })
          )
        ),
        tap(res => {
          this.players.set(res.data?.documents ?? []);
          this.total.set(res.count ?? 0);
          this.pagination.set(res.pagination ?? null);
          this.loading.set(false);
        }),
        switchMap(res => {
          const ids = (res.data?.documents ?? []).map(p => p._id);
          if (!ids.length) return of(null);
          return this.reportService.getAverageRatings(ids).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(res => {
        if (!res) { this.avgRatings.set({}); return; }
        const averages = res.data?.averages ?? {};
        const map: Record<string, number> = {};
        Object.keys(averages).forEach(id => { map[id] = averages[id].overallRating; });
        this.avgRatings.set(map);
      });

    // البحث بالكتابة هو الوحيد المتأخّر. الفلاتر التانية (بوزيشن/فريق/صفحة)
    // أحداث منفصلة بتحصل مرة واحدة، فبتروح على الخط على طول — لكنها بتعدّي من
    // نفس الـswitchMap فحمايتها من السباق موجودة برضه.
    this.keywordInput$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.currentPage.set(1);
        this.reload$.next();
      });
  }

  load(): void {
    this.reload$.next();
  }

  // زرار المسح بيعدّي من نفس الـSubject مش من load() مباشرةً: debounceTime
  // بيرمي القيمة المعلّقة ويطلع الأخيرة بس، فده بيضمن إن ضغطة المسح مابيلحقهاش
  // طلب زيادة من آخر حرف اتكتب. التكلفة 300ms على المسح، والمقابل مسار واحد
  // للبحث مفيهوش حالة سباق تانية نتابعها.
  clearKeyword(): void {
    this.keyword = '';
    this.keywordInput$.next('');
  }

  onKeywordChange(value: string): void {
    this.keywordInput$.next(value ?? '');
  }

  avgRating(playerId: string): number | null {
    return this.avgRatings()[playerId] ?? null;
  }

  ratingColor(rating: number | null): string {
    if (rating == null) return 'var(--text-muted)';
    return rating >= 8 ? '#22c55e' : rating >= 5 ? '#f59e0b' : '#f43f5e';
  }

  resetAndLoad(): void {
    this.currentPage.set(1);
    this.load();
  }

  changePage(page: number): void {
    this.currentPage.set(page);
    this.load();
  }

  setStatus(s: PlayerStatus | ''): void {
    // URL-driven: the queryParamMap subscription reloads the right view (groups or players)
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: s || null },
      queryParamsHandling: 'merge',
    });
  }

  confirmDelete(player: Player): void {
    this.deleteTarget.set(player);
  }

  doDelete(): void {
    const p = this.deleteTarget();
    if (!p) return;
    this.playerService.delete(p._id).subscribe(() => {
      this.deleteTarget.set(null);
      this.load();
    });
  }

  initials(name: string): string {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  // team can arrive unpopulated (a raw ObjectId string) — never show the raw id, only a real team name.
  // Falls back to the free-text teamName when the player isn't linked to a registered team.
  teamName(player: Player): string {
    const team = player.team;
    if (team && typeof team !== 'string') return team.name;
    return player.teamName ?? '';
  }

  // coach is omitted entirely for observers, and never populated for coach's own player list — only show a real name
  coachName(player: Player): string {
    const coach = player.coach;
    if (!coach || typeof coach === 'string') return '';
    return coach.name;
  }

  // specs/010-professional-lens-creator — createdBy is only ever populated to
  // { _id, name } for admins; for every other role it stays a bare id string
  // (or is absent), so this mirrors coachName()'s guard exactly.
  creatorName(player: Player): string {
    const createdBy = player.createdBy;
    if (!createdBy || typeof createdBy === 'string') return '';
    return createdBy.name;
  }

  // لاعب "يتيم" — كوتشه اتمسح نهائياً فالحقل اتفضّى من السيرفر. ملحوظة مهمة:
  // غياب الاسم لوحده مش دليل — الحقل بيتشال أصلاً للأوبزيرفرز وللكوتش في قايمة
  // لاعبينه (شوف التعليق فوق). فبنشرط على الأدمن، اللي هو الوحيد اللي الـAPI
  // بيرجّعله الحقل ده معمول له populate، وبالتالي فراغه عنده معناه فراغ حقيقي.
  isOrphaned(player: Player): boolean {
    return this.auth.isAdmin() && !player.coach;
  }

  calcAge(dob: string): number {
    if (!dob) return 0;
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
    return age;
  }

  navigate(path: string[]): void {
    // Use window.location as fallback — RouterLink handles navigation via template
    window.location.href = '/' + path.join('/');
  }
}
