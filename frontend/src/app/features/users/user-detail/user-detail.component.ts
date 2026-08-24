import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserService } from '../services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { User } from '../../../core/models/user.model';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ImageLightboxComponent } from '../../../shared/components/image-lightbox/image-lightbox.component';

@Component({
    selector: 'app-user-detail',
    imports: [RouterLink, FormsModule, SkeletonLoaderComponent, ConfirmDialogComponent, ImageLightboxComponent, TranslatePipe],
    template: `
    <div class="max-w-4xl mx-auto space-y-5">

      <!-- Breadcrumb -->
      <nav class="flex items-center gap-2 text-sm" style="color:var(--text-muted)">
        <a [routerLink]="isObserverCtx() ? '/observers' : (isProScoutCtx() ? '/professional-league' : '/users')" class="hover:text-primary-600 transition-colors">
          {{ (isObserverCtx() ? 'OBSERVERS.TITLE' : (isProScoutCtx() ? 'PROFESSIONAL_LEAGUE.TITLE' : 'COACHES.TITLE')) | translate }}
        </a>
        <span>/</span>
        <span style="color:var(--text-primary)">{{ user()?.name ?? ('COMMON.LOADING' | translate) }}</span>
      </nav>

      @if (loading()) {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <app-skeleton-loader type="card" [count]="1" />
          <div class="lg:col-span-2">
            <app-skeleton-loader type="card" [count]="1" />
          </div>
        </div>
      } @else if (user()) {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

          <!-- ── Sidebar ── -->
          <div class="card p-6 flex flex-col items-center text-center gap-4">

            <!-- Profile image -->
            <div class="relative">
              @if (user()!.profileImg) {
                <button type="button" class="rounded-full cursor-pointer" style="padding:0;border:none;background:none"
                        (click)="openLightbox(user()!.profileImg!, user()!.name)" [attr.aria-label]="'COMMON.VIEW_IMAGE' | translate">
                  <img [src]="user()!.profileImg" alt="Profile"
                       class="w-28 h-28 rounded-full object-cover shadow-lg"
                       style="border:3px solid var(--bg-card); outline:2px solid var(--border-color)" />
                </button>
              } @else {
                <div class="w-28 h-28 rounded-full flex items-center justify-center text-white text-4xl font-black shadow-lg"
                     style="background:linear-gradient(135deg,#22c55e,#16a34a); border:3px solid var(--bg-card); outline:2px solid var(--border-color)">
                  {{ user()!.name[0]?.toUpperCase() }}
                </div>
              }
              <!-- Online/status dot -->
              <span class="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
                    [class]="user()!.active ? 'bg-green-500' : 'bg-red-400'"
                    style="border-color:var(--bg-card)"></span>
            </div>

            <!-- Name + role -->
            <div>
              <h2 class="text-lg font-bold leading-tight" style="color:var(--text-primary)">{{ user()!.name }}</h2>
              <span class="mt-1.5 inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize"
                    [class]="roleBadgeClass()">
                {{ user()!.role }}
              </span>
            </div>

            <!-- Contact -->
            <div class="w-full border-t pt-4 space-y-2.5 text-left" style="border-color:var(--border-color)">
              <div class="flex items-center gap-2.5 text-sm" style="color:var(--text-secondary)">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,12 2,6"/>
                </svg>
                <span class="truncate">{{ user()!.email }}</span>
              </div>
              @if (user()!.phoneNumber) {
                <div class="flex items-center gap-2.5 text-sm" style="color:var(--text-secondary)">
                  <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.71 3.41 2 2 0 0 1 3.68 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  {{ user()!.phoneNumber }}
                </div>
              }
              <div class="flex items-center gap-2.5 text-sm" style="color:var(--text-secondary)">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {{ user()!.active ? ('COACHES.DETAIL.ACTIVE' | translate) : ('COACHES.DETAIL.DEACTIVATED' | translate) }}
              </div>
            </div>

            <!-- National ID card — hidden by default, needs the admin's vault password to reveal -->
            <div class="w-full border-t pt-4" style="border-color:var(--border-color)">
              <div class="flex items-center justify-between mb-2">
                <p class="text-xs font-medium uppercase tracking-wide text-left" style="color:var(--text-muted)">{{ 'COACHES.DETAIL.ID_CARD' | translate }}</p>
                @if (vaultRevealed()) {
                  <button type="button" class="flex items-center gap-1 text-xs font-medium" style="color:var(--text-muted)" (click)="hideIdCard()">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                    {{ 'COACHES.DETAIL.ID_CARD_HIDE' | translate }}
                  </button>
                }
              </div>

              @if (!vaultRevealed()) {
                <button type="button" class="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed transition-colors hover:bg-[var(--bg-card-hover)]"
                        style="border-color:var(--border-color)" (click)="openVaultModal()">
                  <svg class="w-6 h-6" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span class="text-xs" style="color:var(--text-muted)">{{ 'COACHES.DETAIL.ID_CARD_REVEAL' | translate }}</span>
                </button>
              } @else if (idCardFront() || idCardBack()) {
                <div class="grid grid-cols-2 gap-2">
                  @if (idCardFront()) {
                    <div>
                      <button type="button" class="w-full cursor-pointer" style="padding:0;border:none;background:none"
                              (click)="openLightbox(idCardFront()!, 'ID card front')" [attr.aria-label]="'COMMON.VIEW_IMAGE' | translate">
                        <img [src]="idCardFront()" alt="ID card front" class="w-full rounded-lg border object-cover" style="border-color:var(--border-color); aspect-ratio:16/10;" />
                      </button>
                      <p class="text-xs text-center mt-1" style="color:var(--text-muted)">{{ 'COACHES.FORM.ID_CARD_FRONT' | translate }}</p>
                    </div>
                  }
                  @if (idCardBack()) {
                    <div>
                      <button type="button" class="w-full cursor-pointer" style="padding:0;border:none;background:none"
                              (click)="openLightbox(idCardBack()!, 'ID card back')" [attr.aria-label]="'COMMON.VIEW_IMAGE' | translate">
                        <img [src]="idCardBack()" alt="ID card back" class="w-full rounded-lg border object-cover" style="border-color:var(--border-color); aspect-ratio:16/10;" />
                      </button>
                      <p class="text-xs text-center mt-1" style="color:var(--text-muted)">{{ 'COACHES.FORM.ID_CARD_BACK' | translate }}</p>
                    </div>
                  }
                </div>
              } @else {
                <p class="text-xs text-center py-4" style="color:var(--text-muted)">{{ 'COACHES.DETAIL.ID_CARD_NONE' | translate }}</p>
              }
            </div>

            <!-- Action buttons -->
            <div class="w-full border-t pt-4 space-y-2" style="border-color:var(--border-color)">
              <a [routerLink]="[isObserverCtx() ? '/observers' : (isProScoutCtx() ? '/professional-league/pro-scouts' : '/users'), user()!._id, 'edit']" class="btn btn-secondary btn-sm w-full">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                {{ 'COACHES.DETAIL.EDIT' | translate }}
              </a>
              @if (!isProScoutCtx()) {
                <a [routerLink]="dashboardLink()" class="btn btn-secondary btn-sm w-full">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                  {{ 'COACHES.DETAIL.VIEW_DASHBOARD' | translate }}
                </a>
                <a [routerLink]="['/players']" [queryParams]="playersQueryParams()" class="btn btn-secondary btn-sm w-full">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                  {{ isObserverCtx() ? ('OBSERVERS.DETAIL.VIEW_PLAYERS' | translate) : ('COACHES.DETAIL.VIEW_PLAYERS' | translate) }}
                </a>
              }
              @if (isObserverCtx()) {
                <a [routerLink]="['/observer-evaluations']" [queryParams]="{ observer: user()!._id }" class="btn btn-secondary btn-sm w-full">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                  </svg>
                  {{ 'OBSERVER_EVAL.TITLE' | translate }}
                </a>
              }
              @if (isCoachCtx()) {
                <a [routerLink]="['/coach-evaluations']" [queryParams]="{ coach: user()!._id }" class="btn btn-secondary btn-sm w-full">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                  </svg>
                  {{ 'COACH_EVAL.TITLE' | translate }}
                </a>
              }
              @if (user()!.active) {
                <button class="btn btn-danger btn-sm w-full" (click)="showConfirm.set(true)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"/>
                  </svg>
                  {{ 'COACHES.DETAIL.DEACTIVATE' | translate }}
                </button>
              } @else {
                <button class="btn btn-primary btn-sm w-full" (click)="doRestore()">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.2"/>
                  </svg>
                  {{ 'COACHES.DETAIL.RESTORE' | translate }}
                </button>
              }
            </div>
          </div>

          <!-- ── Main content ── -->
          <div class="lg:col-span-2 space-y-5">

            <!-- Account details -->
            <div class="card p-6">
              <h3 class="text-base font-semibold mb-4" style="color:var(--text-primary)">{{ 'COACHES.DETAIL.ACCOUNT' | translate }}</h3>
              <div class="grid grid-cols-2 gap-x-6 gap-y-4">
                @for (field of detailFields(); track field.label) {
                  <div>
                    <p class="text-xs font-medium uppercase tracking-wide mb-1" style="color:var(--text-muted)">{{ field.label }}</p>
                    @if (field.badge) {
                      <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                            [class]="field.badgeClass">{{ field.value }}</span>
                    } @else {
                      <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ field.value }}</p>
                    }
                  </div>
                }
              </div>
            </div>

            <!-- Quick links -->
            <div class="card p-6">
              <h3 class="text-base font-semibold mb-4" style="color:var(--text-primary)">{{ 'COACHES.DETAIL.QUICK_ACCESS' | translate }}</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <a [routerLink]="dashboardLink()"
                   class="flex items-center gap-3 p-4 rounded-xl border transition-colors hover:bg-[var(--bg-card-hover)]"
                   style="border-color:var(--border-color)">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style="background:rgba(34,197,94,0.12)">
                    <svg class="w-5 h-5" style="color:#22c55e" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                  </div>
                  <div>
                    <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ 'COACHES.DETAIL.DASHBOARD_TITLE' | translate }}</p>
                    <p class="text-xs" style="color:var(--text-muted)">{{ 'COACHES.DETAIL.DASHBOARD_SUBTITLE' | translate }}</p>
                  </div>
                  <svg class="w-4 h-4 ml-auto flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>

                <a [routerLink]="['/players']" [queryParams]="playersQueryParams()"
                   class="flex items-center gap-3 p-4 rounded-xl border transition-colors hover:bg-[var(--bg-card-hover)]"
                   style="border-color:var(--border-color)">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style="background:rgba(99,102,241,0.1)">
                    <svg class="w-5 h-5" style="color:#6366f1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                    </svg>
                  </div>
                  <div>
                    <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ 'COACHES.DETAIL.PLAYERS_TITLE' | translate }}</p>
                    <p class="text-xs" style="color:var(--text-muted)">{{ 'COACHES.DETAIL.PLAYERS_SUBTITLE' | translate }}</p>
                  </div>
                  <svg class="w-4 h-4 ml-auto flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>

                @if (isObserverCtx()) {
                  <a [routerLink]="['/observer-evaluations']" [queryParams]="{ observer: user()!._id }"
                     class="flex items-center gap-3 p-4 rounded-xl border transition-colors hover:bg-[var(--bg-card-hover)]"
                     style="border-color:var(--border-color)">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                         style="background:rgba(245,158,11,0.12)">
                      <svg class="w-5 h-5" style="color:#f59e0b" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                      </svg>
                    </div>
                    <div>
                      <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ 'OBSERVER_EVAL.QUICK_TITLE' | translate }}</p>
                      <p class="text-xs" style="color:var(--text-muted)">{{ 'OBSERVER_EVAL.QUICK_SUBTITLE' | translate }}</p>
                    </div>
                    <svg class="w-4 h-4 ml-auto flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </a>
                }
                @if (isCoachCtx()) {
                  <a [routerLink]="['/coach-evaluations']" [queryParams]="{ coach: user()!._id }"
                     class="flex items-center gap-3 p-4 rounded-xl border transition-colors hover:bg-[var(--bg-card-hover)]"
                     style="border-color:var(--border-color)">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                         style="background:rgba(245,158,11,0.12)">
                      <svg class="w-5 h-5" style="color:#f59e0b" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
                      </svg>
                    </div>
                    <div>
                      <p class="text-sm font-semibold" style="color:var(--text-primary)">{{ 'COACH_EVAL.QUICK_TITLE' | translate }}</p>
                      <p class="text-xs" style="color:var(--text-muted)">{{ 'COACH_EVAL.QUICK_SUBTITLE' | translate }}</p>
                    </div>
                    <svg class="w-4 h-4 ml-auto flex-shrink-0" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </a>
                }

              </div>
            </div>
          </div>
        </div>
      }
    </div>

    @if (showConfirm()) {
      <app-confirm-dialog
        [title]="'COACHES.DETAIL.DEACTIVATE_TITLE' | translate"
        [message]="'COACHES.DETAIL.DEACTIVATE_MSG' | translate:{name: user()!.name}"
        [confirmLabel]="'COACHES.DETAIL.DEACTIVATE' | translate"
        [danger]="true"
        (confirmed)="doDeactivate()"
        (cancelled)="showConfirm.set(false)"
      />
    }

    @if (showVaultModal()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background:rgba(0,0,0,0.5)" (click)="closeVaultModal()">
        <div class="card p-6 w-full max-w-sm" (click)="$event.stopPropagation()">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(99,102,241,0.15)">
              <svg class="w-4.5 h-4.5" style="width:18px;height:18px;color:#818cf8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h3 class="font-semibold text-sm" style="color:var(--text-primary)">{{ 'COACHES.DETAIL.VAULT_MODAL_TITLE' | translate }}</h3>
          </div>
          <p class="text-xs mb-3" style="color:var(--text-muted)">{{ 'COACHES.DETAIL.VAULT_MODAL_HINT' | translate }}</p>
          <input type="password" class="form-input" [(ngModel)]="vaultPasswordInput" (keyup.enter)="submitVaultPassword()"
                 placeholder="••••••••" autofocus />
          @if (vaultError()) {
            <p class="field-error mt-1.5">{{ vaultError() }}</p>
          }
          <div class="flex gap-2 mt-5">
            <button type="button" class="btn btn-primary flex-1" [disabled]="vaultLoading()" (click)="submitVaultPassword()">
              {{ vaultLoading() ? ('COMMON.LOADING' | translate) : ('COACHES.DETAIL.VAULT_UNLOCK' | translate) }}
            </button>
            <button type="button" class="btn btn-secondary flex-1" (click)="closeVaultModal()">{{ 'COMMON.CANCEL' | translate }}</button>
          </div>
        </div>
      </div>
    }

    <app-image-lightbox [src]="lightboxSrc()" [alt]="lightboxAlt()" (closed)="closeLightbox()" />
  `
})
export class UserDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly auth = inject(AuthService);

  readonly user = signal<User | null>(null);
  readonly loading = signal(true);
  readonly showConfirm = signal(false);

  // ID card images تفضل مقفولة لغاية ما الأدمن يدخل باسورد الخزنة الخاص بيه.
  // البايتات بتتجاب من السيرفر (vault zone) وتتحوّل لـ object URL — مفيش URL دائم بيتعرض (C3).
  readonly showVaultModal = signal(false);
  readonly vaultRevealed = signal(false);
  readonly hasIdCard = signal<{ front: boolean; back: boolean }>({ front: false, back: false });
  readonly idCardFront = signal<string | null>(null); // object URL
  readonly idCardBack = signal<string | null>(null);  // object URL
  readonly vaultLoading = signal(false);
  readonly vaultError = signal('');
  vaultPasswordInput = '';

  // Lightbox: enlarge any image on click (profile avatar or ID card front/back)
  readonly lightboxSrc = signal<string | null>(null);
  readonly lightboxAlt = signal('');

  openLightbox(src: string, alt: string): void {
    this.lightboxSrc.set(src);
    this.lightboxAlt.set(alt);
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
  }

  // Route tells us up-front whether we're in the Observers area; user().role confirms it
  // once loaded (covers the rare case of navigating to /users/:id for an observer record).
  private readonly routeIsObserver = this.router.url.startsWith('/observers');
  private readonly routeIsProScout = this.router.url.startsWith('/professional-league');
  readonly isObserverCtx = computed(() => this.routeIsObserver || this.user()?.role === 'observer');
  readonly isProScoutCtx = computed(() => !this.isObserverCtx() && (this.routeIsProScout || this.user()?.role === 'proScout'));
  readonly isCoachCtx = computed(() => !this.isObserverCtx() && !this.isProScoutCtx() && this.user()?.role === 'coach');

  playersQueryParams() {
    const id = this.user()!._id;
    return this.isObserverCtx() ? { observer: id } : { coach: id };
  }

  dashboardLink() {
    const id = this.user()!._id;
    return this.isObserverCtx() ? ['/dashboard/admin/observer', id] : ['/dashboard/admin', id];
  }

  roleBadgeClass(): string {
    const role = this.user()!.role;
    if (role === 'admin') return 'bg-purple-100 text-purple-700';
    if (role === 'observer') return 'bg-indigo-100 text-indigo-700';
    if (role === 'proScout') return 'bg-pink-100 text-pink-700';
    return 'bg-green-100 text-green-700';
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('userId')!;
    this.userService.getOne(id).subscribe({
      next: res => {
        this.user.set((res.data as any)?.document ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigate([this.isObserverCtx() ? '/observers' : (this.isProScoutCtx() ? '/professional-league' : '/users')]);
      },
    });
  }

  detailFields() {
    const u = this.user()!;
    return [
      {
        label: this.translate.instant('COACHES.DETAIL.STATUS'),
        value: u.active ? this.translate.instant('COACHES.DETAIL.STATUS_ACTIVE') : this.translate.instant('COACHES.DETAIL.STATUS_INACTIVE'),
        badge: true,
        badgeClass: u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
      },
      {
        label: this.translate.instant('COACHES.DETAIL.ROLE'),
        value: u.role,
        badge: true,
        badgeClass: this.roleBadgeClass(),
      },
      { label: this.translate.instant('COACHES.DETAIL.EMAIL'), value: u.email, badge: false, badgeClass: '' },
      { label: this.translate.instant('COACHES.DETAIL.PHONE'), value: u.phoneNumber || '—', badge: false, badgeClass: '' },
      { label: this.translate.instant('COACHES.DETAIL.ADDRESS'), value: u.address || '—', badge: false, badgeClass: '' },
      { label: this.translate.instant('COACHES.DETAIL.BIRTH_DATE'), value: u.birthDate ? u.birthDate.slice(0, 10) : '—', badge: false, badgeClass: '' },
    ];
  }

  doDeactivate(): void {
    const u = this.user();
    if (!u) return;
    this.userService.softDelete(u._id).subscribe(() => {
      this.showConfirm.set(false);
      this.toast.success(this.translate.instant('COACHES.BADGE_DEACTIVATED'));
      this.user.update(prev => prev ? { ...prev, active: false } : prev);
    });
  }

  doRestore(): void {
    const u = this.user();
    if (!u) return;
    this.userService.restore(u._id).subscribe(() => {
      this.toast.success(this.translate.instant('COMMON.RESTORE'));
      this.user.update(prev => prev ? { ...prev, active: true } : prev);
    });
  }

  openVaultModal(): void {
    this.vaultError.set('');
    this.vaultPasswordInput = '';
    this.showVaultModal.set(true);
  }

  closeVaultModal(): void {
    this.showVaultModal.set(false);
  }

  private revokeIdCardUrls(): void {
    const f = this.idCardFront();
    const b = this.idCardBack();
    if (f) URL.revokeObjectURL(f);
    if (b) URL.revokeObjectURL(b);
    this.idCardFront.set(null);
    this.idCardBack.set(null);
  }

  hideIdCard(): void {
    this.vaultRevealed.set(false);
    this.revokeIdCardUrls();
    this.hasIdCard.set({ front: false, back: false });
  }

  private fetchIdCardBlob(id: string, side: 'front' | 'back', vaultToken: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.userService.getIdCardSideBlob(id, side, vaultToken).subscribe({
        next: (blob) => resolve(URL.createObjectURL(blob)),
        error: () => resolve(null),
      });
    });
  }

  async submitVaultPassword(): Promise<void> {
    if (!this.vaultPasswordInput) return;
    this.vaultLoading.set(true);
    this.vaultError.set('');
    try {
      const { vaultToken } = await this.auth.verifyVaultPassword(this.vaultPasswordInput);
      const id = this.user()!._id;

      // 1) presence flags (never a URL)
      const presence = await new Promise<{ front: boolean; back: boolean }>((resolve, reject) => {
        this.userService.getIdCardPresence(id, vaultToken).subscribe({
          next: (r) => resolve(r.data as any),
          error: reject,
        });
      });
      this.hasIdCard.set(presence);

      // 2) stream the bytes for whichever sides exist → object URLs
      this.revokeIdCardUrls();
      if (presence.front) this.idCardFront.set(await this.fetchIdCardBlob(id, 'front', vaultToken));
      if (presence.back) this.idCardBack.set(await this.fetchIdCardBlob(id, 'back', vaultToken));

      this.vaultRevealed.set(true);
      this.showVaultModal.set(false);
    } catch (err: any) {
      this.vaultError.set(err?.error?.message ?? this.translate.instant('COACHES.DETAIL.VAULT_ERROR'));
    } finally {
      this.vaultLoading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.revokeIdCardUrls();
  }
}
