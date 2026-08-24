import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PlayerService } from '../services/player.service';
import { UserService } from '../../users/services/user.service';
import { ScoutingReportService } from '../../scouting-reports/services/scouting-report.service';
import { ReportStatistics } from '../../../core/models/scouting-report.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/auth/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';
import { Player, PlayerStatus, PLAYER_POSITIONS } from '../../../core/models/player.model';
import { PlayerContextService } from '../../../core/services/player-context.service';
import { BreadcrumbContextService } from '../../../core/services/breadcrumb-context.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ImageLightboxComponent } from '../../../shared/components/image-lightbox/image-lightbox.component';
import { PlayerSelectedCelebrationComponent } from './player-selected-celebration.component';

@Component({
    selector: 'app-player-detail',
    imports: [RouterLink, RouterOutlet, RouterLinkActive, FormsModule, DatePipe, TitleCasePipe, SkeletonLoaderComponent, ConfirmDialogComponent, ImageLightboxComponent, PlayerSelectedCelebrationComponent, TranslatePipe],
    template: `
    <div class="max-w-5xl mx-auto space-y-5">

      <!-- Breadcrumb -->
      <nav class="flex items-center gap-2 text-sm" style="color:var(--text-muted)">
        <a routerLink="/players" class="transition-colors hover:underline" style="color:var(--accent)">{{ 'PLAYERS.TITLE' | translate }}</a>
        @if (auth.isAdmin() && breadcrumbAuthorName()) {
          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          <a [routerLink]="['/users', breadcrumbAuthorId()]" class="transition-colors hover:underline" style="color:var(--accent)">{{ breadcrumbAuthorName() }}</a>
        }
        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        <span style="color:var(--text-primary)">{{ player()?.name ?? ('COMMON.LOADING' | translate) }}</span>
      </nav>

      @if (loading()) {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <app-skeleton-loader type="card" [count]="1" />
          <div class="lg:col-span-2"><app-skeleton-loader type="card" [count]="1" /></div>
        </div>
      } @else if (player()) {

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          <!-- ══ Sidebar Card ══ -->
          <div class="card overflow-hidden" style="transition:box-shadow 0.2s ease">

            <!-- Status-based gradient header -->
            <div class="relative px-6 pt-8 pb-6 overflow-hidden text-center"
                 [style]="'background:' + (
                   player()!.status === 'selected' ? 'linear-gradient(160deg,rgba(34,197,94,0.20) 0%,rgba(16,185,129,0.08) 100%)' :
                   player()!.status === 'rejected' ? 'linear-gradient(160deg,rgba(244,63,94,0.20) 0%,rgba(239,68,68,0.08) 100%)' :
                                                     'linear-gradient(160deg,rgba(245,158,11,0.20) 0%,rgba(234,179,8,0.08) 100%)')">

              <!-- Ambient glow blob -->
              <div style="position:absolute;top:-30px;right:-20px;width:130px;height:130px;border-radius:50%;filter:blur(32px);pointer-events:none;opacity:0.6"
                   [style.background]="player()!.status === 'selected' ? 'rgba(34,197,94,0.18)' : player()!.status === 'rejected' ? 'rgba(244,63,94,0.18)' : 'rgba(245,158,11,0.18)'">
              </div>

              <!-- Avatar -->
              <div class="relative inline-block mb-4">
                @if (player()!.profileImg) {
                  <img [src]="player()!.profileImg" [alt]="player()!.name"
                       class="w-24 h-24 rounded-2xl object-cover"
                       [style.cursor]="auth.isAdmin() ? 'zoom-in' : null"
                       style="box-shadow:0 8px 24px rgba(0,0,0,0.35)"
                       (click)="openLightbox(player()!.profileImg!, player()!.name)" />
                } @else {
                  <div class="w-24 h-24 rounded-2xl flex items-center justify-center text-white font-black text-4xl"
                       [style]="'box-shadow:0 8px 24px rgba(0,0,0,0.35);background:' + (
                         player()!.status === 'selected' ? 'linear-gradient(135deg,#059669,#10b981)' :
                         player()!.status === 'rejected' ? 'linear-gradient(135deg,#be123c,#f43f5e)' :
                                                           'linear-gradient(135deg,#b45309,#f59e0b)')">
                    {{ initials(player()!.name) }}
                  </div>
                }
                <!-- Status ring -->
                <span class="absolute -bottom-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center"
                      [style]="'border:2px solid var(--bg-card);background:' + (
                        player()!.status === 'selected' ? '#22c55e' :
                        player()!.status === 'rejected' ? '#f43f5e' : '#f59e0b')">
                  @if (player()!.status === 'selected') {
                    <svg class="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586l-3.293-3.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clip-rule="evenodd"/></svg>
                  } @else if (player()!.status === 'rejected') {
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  } @else {
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  }
                </span>
              </div>

              <!-- Name -->
              <h2 class="text-xl font-bold leading-tight mb-1" style="color:var(--text-primary)">{{ player()!.name }}</h2>
              <p class="text-xs font-medium uppercase tracking-widest mb-3" style="color:var(--text-muted)">
                {{ player()!.nationality }}
              </p>

              <!-- Status + Position badges -->
              <div class="flex flex-wrap justify-center gap-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                      [style]="player()!.status === 'selected'
                        ? 'background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.30)'
                        : player()!.status === 'rejected'
                        ? 'background:rgba(244,63,94,0.15);color:#fb7185;border:1px solid rgba(244,63,94,0.30)'
                        : player()!.status === 'observed'
                        ? 'background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.30)'
                        : 'background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.30)'">
                  <span class="w-1.5 h-1.5 rounded-full"
                        [style.background]="player()!.status === 'selected' ? '#22c55e' : player()!.status === 'rejected' ? '#f43f5e' : player()!.status === 'observed' ? '#8b5cf6' : '#f59e0b'">
                  </span>
                  {{ player()!.status | titlecase }}
                </span>
                @if (player()!.position) {
                  <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
                        style="background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.25)">
                    {{ positionLabel(player()!.position!) }}
                  </span>
                }
                @if (player()!.preferredFoot) {
                  <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize"
                        style="background:rgba(14,165,233,0.15);color:#38bdf8;border:1px solid rgba(14,165,233,0.25)">
                    {{ player()!.preferredFoot }}
                  </span>
                }
              </div>
            </div>

            <!-- Quick stats strip -->
            <div class="grid grid-cols-3 text-center py-4" style="border-bottom:1px solid var(--border-subtle)">
              <div class="flex flex-col items-center gap-0.5 py-1"
                   style="border-inline-end:1px solid var(--border-subtle)">
                <span class="text-2xl font-black leading-none"
                      [style.color]="player()!.status === 'selected' ? '#4ade80' : player()!.status === 'rejected' ? '#fb7185' : '#fbbf24'">
                  {{ player()!.dateOfBirth | date:'yyyy' }}
                </span>
                <span class="text-[10px] font-semibold uppercase tracking-widest" style="color:var(--text-muted)">BORN</span>
              </div>
              <div class="flex flex-col items-center gap-0.5 py-1"
                   style="border-inline-end:1px solid var(--border-subtle)">
                <span class="text-2xl font-black leading-none capitalize" style="color:#38bdf8">
                  {{ player()!.preferredFoot ? player()!.preferredFoot![0].toUpperCase() : '—' }}
                </span>
                <span class="text-[10px] font-semibold uppercase tracking-widest" style="color:var(--text-muted)">FOOT</span>
              </div>
              <div class="flex flex-col items-center gap-0.5 py-1">
                <span class="text-2xl font-black tabular-nums leading-none" [style.color]="ratingColor(statistics()?.overallRating)">
                  {{ statsLoading() ? '…' : (statistics()?.overallRating ?? '—') }}
                </span>
                <span class="text-[10px] font-semibold uppercase tracking-widest" style="color:var(--text-muted)">{{ 'PLAYERS.DETAIL.AVG_RATING' | translate }}</span>
              </div>
            </div>

            <!-- Info list -->
            <div class="px-5 py-4 space-y-3">
              @if (player()!.team || player()!.teamName) {
                <div class="flex items-center gap-3" style="color:var(--text-secondary)">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style="background:var(--bg-secondary)">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <div>
                    <p class="text-[10px] font-semibold uppercase tracking-wider" style="color:var(--text-muted)">Team</p>
                    <p class="text-sm font-medium" style="color:var(--text-primary)">{{ teamLabel() }}</p>
                  </div>
                </div>
              }

              <div class="flex items-center gap-3" style="color:var(--text-secondary)">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                     style="background:var(--bg-secondary)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider" style="color:var(--text-muted)">Date of Birth</p>
                  <p class="text-sm font-medium" style="color:var(--text-primary)">{{ player()!.dateOfBirth | date:'mediumDate' }}</p>
                </div>
              </div>

              <div class="flex items-center gap-3" style="color:var(--text-secondary)">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                     style="background:var(--bg-secondary)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider" style="color:var(--text-muted)">City</p>
                  <p class="text-sm font-medium" style="color:var(--text-primary)">{{ player()!.city || '—' }}</p>
                </div>
              </div>

              <div class="flex items-center gap-3" style="color:var(--text-secondary)">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                     style="background:var(--bg-secondary)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.71 3.41 2 2 0 0 1 3.68 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </div>
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-wider" style="color:var(--text-muted)">Phone</p>
                  <p class="text-sm font-medium" style="color:var(--text-primary)">{{ player()!.phoneNumber || '—' }}</p>
                </div>
              </div>

              @if (auth.isAdmin() && coachName()) {
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style="background:rgba(99,102,241,0.12)">
                    <svg class="w-4 h-4" fill="none" stroke="#818cf8" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <p class="text-[10px] font-semibold uppercase tracking-wider" style="color:var(--text-muted)">Coach</p>
                    <a [routerLink]="['/users', coachId()]"
                       class="text-sm font-semibold transition-colors hover:underline" style="color:#818cf8">
                      {{ coachName() }}
                    </a>
                  </div>
                </div>
              }

              <!-- لاعب يتيم: كوتشه اتمسح نهائياً والسيرفر فضّى الحقل. بيتعرض للأدمن
                   بس — هو الوحيد اللي بيشوف حقل الكوتش والوحيد اللي يقدر يعيّن واحد -->
              @if (isOrphaned()) {
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style="background:rgba(245,158,11,0.12)">
                    <svg class="w-4 h-4" style="color:#f59e0b" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      <line x1="17" y1="5" x2="23" y2="11"/><line x1="23" y1="5" x2="17" y2="11"/>
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <p class="text-[10px] font-semibold uppercase tracking-wider" style="color:var(--text-muted)">
                      {{ 'PLAYERS.DETAIL.COACH' | translate }}
                    </p>
                    <p class="text-sm font-semibold" style="color:#f59e0b">{{ 'PLAYERS.NO_COACH' | translate }}</p>
                    <p class="text-xs mt-1" style="color:var(--text-muted)">{{ 'PLAYERS.DETAIL.NO_COACH_HINT' | translate }}</p>
                  </div>
                </div>
              }
            </div>

            <!-- Actions -->
            <div class="px-5 pb-5 pt-3 space-y-2" style="border-top:1px solid var(--border-subtle)">
              @if (auth.isCoach()) {
                <a [routerLink]="['/players', player()!._id, 'edit']" class="btn btn-secondary btn-sm w-full">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  {{ 'PLAYERS.DETAIL.EDIT' | translate }}
                </a>
              }
              @if (auth.isAdmin()) {
                <!-- Coach picker — أدمن-فقط، وبيظهر للاعب اليتيم بس (كوتشه اتمسح
                     نهائياً). نفس نمط الـobserver picker تحت، بس اختيار واحد. -->
                @if (isOrphaned()) {
                  <div class="rounded-xl overflow-hidden"
                       style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.22)">
                    <button type="button"
                            class="observer-toggle w-full flex items-center justify-between gap-2 px-3 transition-colors"
                            [attr.aria-expanded]="coachPanelOpen()"
                            (click)="toggleCoachPanel()">
                      <span class="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style="color:#f59e0b">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                        {{ 'PLAYERS.DETAIL.ASSIGN_COACH' | translate }}
                      </span>
                      <svg class="w-3.5 h-3.5 transition-transform duration-150" style="color:#f59e0b"
                           [style.transform]="coachPanelOpen() ? 'rotate(180deg)' : 'rotate(0deg)'"
                           fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>

                    @if (coachPanelOpen()) {
                      @if (loadingCoaches()) {
                        <p class="text-xs px-3 pb-3" style="color:var(--text-muted)">{{ 'COMMON.LOADING' | translate }}</p>
                      } @else if (coaches().length === 0) {
                        <p class="text-xs px-3 pb-3" style="color:var(--text-muted)">{{ 'PLAYERS.DETAIL.NO_COACHES' | translate }}</p>
                      } @else {
                        <ul class="max-h-52 overflow-y-auto" role="listbox"
                            style="border-top:1px solid rgba(245,158,11,0.15)">
                          @for (c of coaches(); track c._id; let last = $last) {
                            <li role="option" [attr.aria-selected]="selectedCoach() === c._id">
                              <button type="button"
                                      class="observer-row w-full flex items-center gap-2.5 px-3 text-left transition-colors"
                                      [class.observer-row-selected]="selectedCoach() === c._id"
                                      [style.border-bottom]="last ? 'none' : '1px solid rgba(245,158,11,0.10)'"
                                      (click)="selectedCoach.set(c._id)">
                                <span class="flex items-center justify-center rounded-full font-bold flex-shrink-0"
                                      style="width:26px;height:26px;font-size:11px"
                                      [style.background]="selectedCoach() === c._id ? '#f59e0b' : 'rgba(245,158,11,0.16)'"
                                      [style.color]="selectedCoach() === c._id ? '#fff' : '#f59e0b'">
                                  {{ initials(c.name) }}
                                </span>
                                <span class="flex-1 min-w-0 truncate text-sm font-medium" style="color:var(--text-primary)">
                                  {{ c.name }}
                                </span>
                                <span class="observer-check flex-shrink-0" [class.observer-check-on]="selectedCoach() === c._id">
                                  @if (selectedCoach() === c._id) {
                                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  }
                                </span>
                              </button>
                            </li>
                          }
                        </ul>
                        <div class="p-2">
                          <button class="btn btn-primary btn-sm w-full"
                                  data-testid="assign-coach-save"
                                  [disabled]="!selectedCoach() || savingCoach()"
                                  (click)="saveCoach()">
                            {{ 'PLAYERS.DETAIL.ASSIGN_COACH_BTN' | translate }}
                          </button>
                        </div>
                      }
                    }
                  </div>
                }

                <div class="space-y-1.5">
                  <p class="text-[10px] font-semibold uppercase tracking-wider" style="color:var(--text-muted)">
                    {{ 'PLAYERS.DETAIL.CHANGE_STATUS' | translate }}
                  </p>
                  <select class="form-input text-sm" [(ngModel)]="draftStatus"
                          (ngModelChange)="onStatusSelect()">
                    <option value="pending">{{ 'NAV.PENDING' | translate }}</option>
                    <option value="selected">{{ 'NAV.SELECTED' | translate }}</option>
                    <option value="rejected">{{ 'NAV.REJECTED' | translate }}</option>
                    <option value="observed">{{ 'NAV.OBSERVED' | translate }}</option>
                  </select>
                </div>

                <!-- Observer picker — shown whenever the (draft or actual) status is "observed".
                     Collapsed by default; opens into a scrollable list on click and collapses
                     back automatically once the selection is saved. -->
                @if (draftStatus === 'observed') {
                  <div class="rounded-xl overflow-hidden"
                       style="background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.22)">

                    <!-- Toggle header: label + live selection count + chevron -->
                    <button type="button"
                            class="observer-toggle w-full flex items-center justify-between gap-2 px-3 transition-colors"
                            [attr.aria-expanded]="observersPanelOpen()"
                            (click)="observersPanelOpen.set(!observersPanelOpen())">
                      <span class="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style="color:#a78bfa">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                        {{ 'PLAYERS.DETAIL.ASSIGN_OBSERVERS' | translate }}
                      </span>
                      <span class="flex items-center gap-1.5 flex-shrink-0">
                        @if (selectedObservers().size > 0) {
                          <span class="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                                style="background:rgba(139,92,246,0.18);color:#a78bfa">
                            {{ 'PLAYERS.DETAIL.SELECTED_COUNT' | translate:{count: selectedObservers().size} }}
                          </span>
                        }
                        <svg class="w-3.5 h-3.5 transition-transform duration-150" style="color:#a78bfa"
                             [style.transform]="observersPanelOpen() ? 'rotate(180deg)' : 'rotate(0deg)'"
                             fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </span>
                    </button>

                    @if (observersPanelOpen()) {
                      @if (loadingObservers()) {
                        <p class="text-xs px-3 pb-3" style="color:var(--text-muted)">{{ 'COMMON.LOADING' | translate }}</p>
                      } @else if (observers().length === 0) {
                        <p class="text-xs px-3 pb-3" style="color:var(--text-muted)">{{ 'PLAYERS.DETAIL.NO_OBSERVERS' | translate }}</p>
                      } @else {
                        <!-- Selectable list — one row per observer, divider between rows -->
                        <ul class="max-h-52 overflow-y-auto" role="listbox" [attr.aria-multiselectable]="true"
                            style="border-top:1px solid rgba(139,92,246,0.15)">
                          @for (o of observers(); track o._id; let last = $last) {
                            <li role="option" [attr.aria-selected]="isObserverSelected(o._id)">
                              <button type="button"
                                      class="observer-row w-full flex items-center gap-2.5 px-3 text-left transition-colors"
                                      [class.observer-row-selected]="isObserverSelected(o._id)"
                                      [style.border-bottom]="last ? 'none' : '1px solid rgba(139,92,246,0.10)'"
                                      (click)="toggleObserver(o._id)">
                                <!-- Avatar -->
                                <span class="flex items-center justify-center rounded-full font-bold flex-shrink-0"
                                      style="width:26px;height:26px;font-size:11px"
                                      [style.background]="isObserverSelected(o._id) ? '#8b5cf6' : 'rgba(139,92,246,0.16)'"
                                      [style.color]="isObserverSelected(o._id) ? '#fff' : '#a78bfa'">
                                  {{ initials(o.name) }}
                                </span>
                                <span class="flex-1 min-w-0 truncate text-sm font-medium" style="color:var(--text-primary)">
                                  {{ o.name }}
                                </span>
                                <!-- Selection indicator: filled check when selected, empty ring otherwise -->
                                <span class="observer-check flex-shrink-0" [class.observer-check-on]="isObserverSelected(o._id)">
                                  @if (isObserverSelected(o._id)) {
                                    <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                  }
                                </span>
                              </button>
                            </li>
                          }
                        </ul>
                        <div class="p-2">
                          <button class="btn btn-primary btn-sm w-full"
                                  [disabled]="saveObserversDisabled()"
                                  (click)="saveObservers()">
                            {{ 'PLAYERS.DETAIL.ASSIGN_BTN' | translate }}
                          </button>
                        </div>
                      }
                    }
                  </div>
                }

                <!-- Currently assigned observers badge -->
                @if (player()!.status === 'observed' && assignedObserverNames()) {
                  <div class="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                       style="background:rgba(139,92,246,0.10);color:#a78bfa;border:1px solid rgba(139,92,246,0.22)">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span>{{ 'PLAYERS.DETAIL.OBSERVED_BY' | translate }}: <span class="font-semibold">{{ assignedObserverNames() }}</span></span>
                  </div>
                }
                <button class="btn btn-sm w-full font-semibold"
                        style="color:#f43f5e;border:1px solid rgba(244,63,94,0.25);background:rgba(244,63,94,0.06)"
                        (click)="showDeleteConfirm.set(true)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                  {{ 'PLAYERS.DETAIL.DELETE' | translate }}
                </button>
              }
            </div>
          </div>

          <!-- ══ Main content ══ -->
          <div class="lg:col-span-2 space-y-5">

            <!-- Player Details card -->
            <div class="card overflow-hidden">
              <!-- Header -->
              <div class="px-5 py-4 flex items-center gap-3" style="border-bottom:1px solid var(--border-color);background:rgba(255,255,255,0.02)">
                <span style="display:inline-block;width:3px;height:16px;border-radius:2px;flex-shrink:0"
                      [style.background]="player()!.status === 'selected' ? '#22c55e' : player()!.status === 'rejected' ? '#f43f5e' : '#f59e0b'">
                </span>
                <h3 class="font-semibold text-sm" style="color:var(--text-primary)">Player Details</h3>
              </div>
              <!-- Fields grid -->
              <div class="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                @for (field of playerFields(); track field.label) {
                  <div class="rounded-xl p-3.5" style="background:var(--bg-secondary);border:1px solid var(--border-subtle)">
                    <p class="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style="color:var(--text-muted)">{{ field.label }}</p>
                    <p class="text-sm font-semibold leading-snug" style="color:var(--text-primary)">{{ field.value }}</p>
                  </div>
                }
              </div>
            </div>

            <!-- Tabs -->
            <div class="flex gap-1 p-1 rounded-xl" style="background:var(--bg-secondary);border:1px solid var(--border-subtle)">
              @for (tab of tabs; track tab.label) {
                <a [routerLink]="tab.path" routerLinkActive="tab-pill-active"
                   class="tab-pill flex-1 text-center px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150">
                  {{ tab.label }}
                </a>
              }
            </div>

            <!-- Nested route outlet -->
            <router-outlet />
          </div>
        </div>
      }
    </div>

    @if (showDeleteConfirm()) {
      <app-confirm-dialog
        [title]="'PLAYERS.DETAIL.DELETE_TITLE' | translate"
        [message]="'PLAYERS.DETAIL.DELETE_MSG' | translate:{name: player()!.name}"
        confirmLabel="Delete"
        [danger]="true"
        (confirmed)="doDelete()"
        (cancelled)="showDeleteConfirm.set(false)"
      />
    }

    @if (showCelebration()) {
      <app-player-selected-celebration
        [playerName]="player()!.name"
        (dismissed)="dismissCelebration()"
      />
    }

    <app-image-lightbox [src]="lightboxSrc()" [alt]="lightboxAlt()" (closed)="closeLightbox()" />
  `,
    styles: [`
    /* Collapsible observer picker header */
    .observer-toggle {
      min-height: 40px;
      padding-top: 8px;
      padding-bottom: 8px;
      background: transparent;
      border: none;
      cursor: pointer;
    }
    .observer-toggle:hover {
      background: rgba(139,92,246,0.06);
    }
    .observer-toggle:focus-visible {
      outline: 2px solid #8b5cf6;
      outline-offset: -2px;
    }

    /* Observer selectable list — one row per observer */
    .observer-row {
      min-height: 44px;
      cursor: pointer;
      background: transparent;
      border: none;
      border-radius: 0;
    }
    .observer-row:hover {
      background: rgba(139,92,246,0.08);
    }
    .observer-row:focus-visible {
      outline: 2px solid #8b5cf6;
      outline-offset: -2px;
    }
    .observer-row-selected {
      background: rgba(139,92,246,0.12);
    }
    .observer-row-selected:hover {
      background: rgba(139,92,246,0.16);
    }
    .observer-check {
      width: 20px;
      height: 20px;
      border-radius: 9999px;
      border: 2px solid rgba(139,92,246,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 150ms ease, border-color 150ms ease, transform 150ms ease;
    }
    .observer-check svg {
      width: 12px;
      height: 12px;
    }
    .observer-check-on {
      background: #8b5cf6;
      border-color: #8b5cf6;
      transform: scale(1.05);
    }
    @media (prefers-reduced-motion: reduce) {
      .observer-check { transition: none; }
    }

    .tab-pill {
      color: var(--text-muted);
    }
    .tab-pill:hover {
      color: var(--text-primary);
      background: rgba(255,255,255,0.04);
    }
    .tab-pill-active {
      color: var(--text-primary) !important;
      background: var(--bg-card) !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.18), 0 0 0 1px var(--border-subtle);
    }
    :host-context([data-theme="light"]) .tab-pill-active {
      box-shadow: 0 1px 4px rgba(13,27,46,0.10), 0 0 0 1px var(--border-color);
    }
  `]
})
export class PlayerDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly playerService = inject(PlayerService);
  private readonly userService = inject(UserService);
  private readonly reportService = inject(ScoutingReportService);
  private readonly socketService = inject(SocketService);
  private readonly toastService = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly playerContext = inject(PlayerContextService);
  private readonly breadcrumbContext = inject(BreadcrumbContextService);
  readonly auth = inject(AuthService);

  readonly player = signal<Player | null>(null);
  readonly loading = signal(true);
  readonly showDeleteConfirm = signal(false);
  readonly showCelebration = signal(false);
  readonly lightboxSrc = signal<string | null>(null);
  readonly lightboxAlt = signal('');

  // متوسط تقارير اللاعب — بيتحمل مرة واحدة مع تحميل اللاعب، وبيظهر في شريط الإحصائيات السريع
  readonly statistics = signal<ReportStatistics | null>(null);
  readonly statsLoading = signal(false);

  // Observer assignment state (admin only) — a player can be observed by several observers at once.
  // The picker list stays collapsed until opened, and collapses back once the selection is saved
  // (keeps the sidebar compact when there are many observers).
  readonly observers = signal<User[]>([]);
  readonly loadingObservers = signal(false);
  readonly selectedObservers = signal<Set<string>>(new Set());
  readonly observersPanelOpen = signal(false);

  // تعيين كوتش للاعب اليتيم — اختيار واحد، والقايمة بتتحمّل عند أول فتح للبانل
  // بس (مش مع كل تحميل للاعب) عشان مانعملش ريكوست لكل لاعب عنده كوتش أصلاً
  readonly coaches = signal<User[]>([]);
  readonly loadingCoaches = signal(false);
  readonly selectedCoach = signal<string | null>(null);
  readonly coachPanelOpen = signal(false);
  readonly savingCoach = signal(false);
  draftStatus: PlayerStatus = 'pending';

  // team is populated as an object by the API, but guard against a plain id string too.
  // Falls back to the free-text teamName when the player isn't linked to a registered team.
  teamLabel(): string {
    const team = this.player()?.team;
    if (team) return typeof team === 'string' ? team : team.name;
    return this.player()?.teamName ?? '';
  }

  get tabs() {
    return [
      { label: this.translate.instant('PLAYERS.DETAIL.REPORTS_TAB'), path: ['reports'] },
      { label: this.translate.instant('PLAYERS.DETAIL.MEDIA_TAB'), path: ['media'] },
    ];
  }

  constructor() {
    this.socketService.getPlayerStatusUpdates()
      .pipe(takeUntilDestroyed())
      .subscribe(({ playerId, status }) => {
        if (this.player()?._id === playerId) {
          this.player.update(p => p ? { ...p, status } : p);
        }
      });
  }

  ngOnDestroy(): void {
    this.playerContext.clear();
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('playerId')!;
    this.playerService.getOne(id).subscribe({
      next: res => {
        const p = res.data?.document ?? null;
        this.player.set(p);
        this.draftStatus = p?.status ?? 'pending';
        this.selectedObservers.set(new Set(this.observerIds(p)));
        this.loading.set(false);
        if (p?.position) this.playerContext.set(p.position);
        if (this.auth.isAdmin()) this.loadObservers();
        if (p) this.loadStatistics(p._id);

        // جاي من نوتيفيكشن "تم اختيار اللاعب" — اعرض احتفال لمرة واحدة، وامسح الـ query param عشان الريفريش ميعيدهوش
        if (this.route.snapshot.queryParamMap.get('celebrate') === 'selected' && p?.status === 'selected') {
          this.showCelebration.set(true);
          this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
        }
      },
      error: () => this.loading.set(false),
    });
  }

  dismissCelebration(): void {
    this.showCelebration.set(false);
  }

  private loadStatistics(playerId: string): void {
    this.statsLoading.set(true);
    this.playerContext.reportStatisticsLoading.set(true);
    this.reportService.getStatistics(playerId).subscribe({
      // الباك إند بيرجع 200 بـtotalReports: 0 لما مفيش تقارير لسه (مش 404) —
      // نفس معاملة الحالتين هنا: لا تقارير = statistics فاضي وبيظهر "—".
      // بنحط النتيجة في PlayerContextService كمان عشان ReportListComponent
      // يقراها من هنا بدل ما يعمل ريكوست تاني لنفس الـendpoint
      next: res => {
        const stats = res.data?.statistics;
        const normalized = stats && stats.totalReports > 0 ? stats : null;
        this.statistics.set(normalized);
        this.playerContext.setReportStatistics(normalized);
        this.statsLoading.set(false);
        this.playerContext.reportStatisticsLoading.set(false);
      },
      error: () => {
        this.statsLoading.set(false);
        this.playerContext.reportStatisticsLoading.set(false);
      },
    });
  }

  ratingColor(rating: number | null | undefined): string {
    if (rating == null) return 'var(--text-muted)';
    return rating >= 8 ? '#22c55e' : rating >= 5 ? '#f59e0b' : '#f43f5e';
  }

  private loadObservers(): void {
    if (this.observers().length) return;
    this.loadingObservers.set(true);
    this.userService.getAll({ role: 'observer', sort: 'name' }).subscribe({
      next: res => {
        this.observers.set((res.data as any)?.documents ?? []);
        this.loadingObservers.set(false);
      },
      error: () => this.loadingObservers.set(false),
    });
  }

  toggleCoachPanel(): void {
    const opening = !this.coachPanelOpen();
    this.coachPanelOpen.set(opening);
    if (opening) this.loadCoaches();
  }

  private loadCoaches(): void {
    if (this.coaches().length || this.loadingCoaches()) return;
    this.loadingCoaches.set(true);
    this.userService.getAll({ role: 'coach', sort: 'name' }).subscribe({
      next: res => {
        this.coaches.set((res.data as any)?.documents ?? []);
        this.loadingCoaches.set(false);
      },
      error: () => this.loadingCoaches.set(false),
    });
  }

  saveCoach(): void {
    const id = this.player()?._id;
    const coach = this.selectedCoach();
    if (!id || !coach) return;

    this.savingCoach.set(true);
    this.playerService.assignCoach(id, coach).subscribe({
      next: res => {
        const updated = res.data?.document;
        if (updated) this.player.set(updated);
        this.savingCoach.set(false);
        this.coachPanelOpen.set(false);
        this.selectedCoach.set(null);
        this.toastService.success(this.translate.instant('PLAYERS.DETAIL.COACH_UPDATED'));
      },
      // رسالة الخطأ نفسها بيعرضها errorInterceptor — هنا بنفك القفل بس
      error: () => this.savingCoach.set(false),
    });
  }

  // Non-observed statuses apply immediately; "observed" waits for the observer selection to be saved
  onStatusSelect(): void {
    if (this.draftStatus === 'observed') return;
    this.commitStatus(this.draftStatus);
  }

  toggleObserver(id: string): void {
    this.selectedObservers.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  isObserverSelected(id: string): boolean {
    return this.selectedObservers().has(id);
  }

  // Must pick at least one observer the first time a player becomes "observed";
  // once it's already observed, the list can be edited freely (including down to zero)
  // via the dedicated /observers endpoint.
  saveObserversDisabled(): boolean {
    return this.player()?.status !== 'observed' && this.selectedObservers().size === 0;
  }

  saveObservers(): void {
    const id = this.player()?._id;
    if (!id) return;
    const selected = Array.from(this.selectedObservers());

    if (this.player()?.status !== 'observed') {
      // First-time transition into "observed" — goes through the status endpoint
      if (selected.length === 0) return;
      this.commitStatus('observed', selected);
      return;
    }

    // Already observed — just update who's assigned (admin can remove any single observer here)
    this.playerService.updateObservers(id, selected).subscribe({
      next: res => {
        const updated = res.data?.document;
        if (updated) {
          this.player.update(prev => prev ? { ...prev, observers: updated.observers } : prev);
        }
        this.observersPanelOpen.set(false);
        this.toastService.success(this.translate.instant('PLAYERS.DETAIL.OBSERVERS_UPDATED'));
      },
    });
  }

  private commitStatus(status: PlayerStatus, observers?: string[]): void {
    const id = this.player()?._id;
    if (!id) return;
    this.playerService.updateStatus(id, status, observers).subscribe({
      next: res => {
        const updated = res.data?.document;
        if (updated) {
          this.player.set(updated);
          this.draftStatus = updated.status;
          this.selectedObservers.set(new Set(this.observerIds(updated)));
        }
        this.observersPanelOpen.set(false);
        this.toastService.success(this.translate.instant('PLAYERS.DETAIL.STATUS_UPDATED'));
      },
    });
  }

  private observerIds(p: Player | null): string[] {
    return (p?.observers ?? []).map(o => (typeof o === 'object' ? (o as any)._id : o));
  }

  assignedObserverNames(): string {
    const observers = this.player()?.observers ?? [];
    if (!observers.length) return '';
    const byId = new Map(this.observers().map(o => [o._id, o.name]));
    return observers
      .map(o => (typeof o === 'object' ? (o as any).name ?? '' : byId.get(o) ?? ''))
      .filter(Boolean)
      .join(', ');
  }

  doDelete(): void {
    const id = this.player()?._id;
    if (!id) return;
    this.playerService.delete(id).subscribe(() => {
      this.toastService.success(this.translate.instant('PLAYERS.DETAIL.DELETE'));
      this.router.navigate(['/players']);
    });
  }

  positionLabel(pos: string): string {
    return PLAYER_POSITIONS.find(p => p.value === pos)?.label ?? pos;
  }

  initials(name: string): string {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  // Only admins get the enlarge-on-click affordance for photos
  openLightbox(src: string, alt: string): void {
    if (!this.auth.isAdmin()) return;
    this.lightboxSrc.set(src);
    this.lightboxAlt.set(alt);
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
  }

  coachName(): string {
    const coach = this.player()?.coach;
    if (!coach) return '';
    return typeof coach === 'object' ? (coach as any).name ?? '' : '';
  }

  // البريدكرمب بيفضل يعرض اسم كاتب الريبورت (لو الأدمن داخل من صفحة ريبورت كتبها أوبزيرفر)؛ لو مفيش سياق ريبورت يرجع لاسم الكوتش المسؤول عن اللاعب
  breadcrumbAuthorName(): string {
    return this.breadcrumbContext.reportAuthor()?.name || this.coachName();
  }

  breadcrumbAuthorId(): string {
    return this.breadcrumbContext.reportAuthor()?.id || this.coachId();
  }

  coachId(): string {
    const coach = this.player()?.coach;
    if (!coach) return '';
    return typeof coach === 'object' ? (coach as any)._id ?? '' : (coach as string);
  }

  // لاعب "يتيم" — كوتشه اتمسح نهائياً فالسيرفر فضّى الحقل (شوف §9 في الباكإند).
  // مشروط بالأدمن لأنه الوحيد اللي الـAPI بيرجّعله حقل الكوتش؛ عند الكوتش نفسه
  // والأوبزيرفر الحقل مابيتبعتش أصلاً، ففراغه عندهم مش معناه غياب كوتش.
  isOrphaned(): boolean {
    return this.auth.isAdmin() && !!this.player() && !this.player()!.coach;
  }

  playerFields() {
    const p = this.player()!;
    const fields: { label: string; value: string }[] = [
      { label: this.translate.instant('PLAYERS.DETAIL.NATIONALITY'), value: p.nationality },
      { label: this.translate.instant('PLAYERS.DETAIL.HEIGHT'), value: p.height ? `${p.height} cm` : '—' },
      { label: this.translate.instant('PLAYERS.DETAIL.WEIGHT'), value: p.weight ? `${p.weight} kg` : '—' },
      { label: this.translate.instant('PLAYERS.DETAIL.ADDRESS'), value: p.address },
      { label: this.translate.instant('PLAYERS.DETAIL.NOTES'), value: p.notes || '—' },
    ];
    if (this.auth.isAdmin()) {
      // اللاعب اليتيم بيتقال صراحةً بدل شرطة مبهمة تخلط بين "مفيش كوتش" و"البيانات ناقصة"
      fields.unshift({
        label: this.translate.instant('PLAYERS.DETAIL.COACH'),
        value: this.coachName() || this.translate.instant('PLAYERS.NO_COACH'),
      });
    }
    return fields;
  }
}
