import { Component, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ChangePasswordPayload } from '../../core/models/user.model';

@Component({
    selector: 'app-profile',
    imports: [ReactiveFormsModule, TranslatePipe],
    styles: [`
      .avatar-ring {
        box-shadow: 0 0 0 3px var(--bg-card), 0 0 0 5px rgba(34,197,94,0.35), 0 8px 28px rgba(0,0,0,0.35);
      }
      .section-icon-box {
        width: 36px; height: 36px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }

      /* Input with leading icon — LTR */
      .input-icon-wrap { position: relative; }
      .input-icon-wrap .field-ico {
        position: absolute; top: 50%; transform: translateY(-50%);
        inset-inline-start: 12px;
        width: 15px; height: 15px;
        color: var(--text-muted); pointer-events: none;
      }
      .input-icon-wrap .form-input { padding-inline-start: 2.25rem; }

      /* Phone numbers render LTR even inside this RTL page. Forcing dir:ltr on the
         input flips what "inline-start" means for IT specifically, so the logical
         padding above no longer lines up with the icon (which stays anchored to
         the page's RTL context). Pin both sides with physical left/right instead
         so they always agree regardless of direction context. */
      .input-icon-wrap input[type="tel"] {
        direction: ltr;
        text-align: right;
        padding-left: 0.875rem;
        padding-right: 2.25rem;
      }
      .input-icon-wrap:has(input[type="tel"]) .field-ico {
        left: auto;
        right: 12px;
      }

      /* Password toggle button — anchored to end of input */
      .pw-toggle {
        position: absolute; top: 50%; transform: translateY(-50%);
        inset-inline-end: 12px;
        background: none; border: none; cursor: pointer; padding: 4px;
        color: var(--text-muted); display: flex; align-items: center;
        transition: color 0.15s;
      }
      .pw-toggle:hover { color: var(--text-primary); }
      .form-input.has-toggle { padding-inline-end: 2.5rem; }
    `],
    template: `
    <div class="max-w-2xl mx-auto space-y-5">

      <!-- ── Page header ── -->
      <div>
        <h2 class="page-title">{{ 'PROFILE.TITLE' | translate }}</h2>
        <p class="page-subtitle">{{ 'PROFILE.SUBTITLE' | translate }}</p>
      </div>

      <!-- ── Hero identity card ── -->
      <div class="card overflow-hidden">
        <!-- Gradient banner (decorative only) -->
        <div class="relative h-20 overflow-hidden"
             style="background: linear-gradient(135deg, rgba(34,197,94,0.20) 0%, rgba(16,185,129,0.08) 50%, rgba(99,102,241,0.10) 100%)">
          <!-- Ambient blobs -->
          <div style="position:absolute;top:-30px;right:-20px;width:130px;height:130px;border-radius:50%;
                      background:rgba(34,197,94,0.14);filter:blur(35px);pointer-events:none"></div>
          <div style="position:absolute;bottom:-20px;left:10%;width:100px;height:100px;border-radius:50%;
                      background:rgba(99,102,241,0.09);filter:blur(28px);pointer-events:none"></div>
        </div>

        <!-- Avatar + identity strip -->
        <div class="px-6 pb-5">
          <div class="flex items-end gap-4" style="margin-top:-34px">
            <!-- Avatar -->
            <div class="avatar-ring rounded-2xl flex items-center justify-center font-black text-white flex-shrink-0"
                 style="width:68px;height:68px;font-size:24px;background:linear-gradient(135deg,#059669,#22c55e);">
              {{ initials() }}
            </div>

            <!-- Name + role + badge -->
            <div class="pb-1">
              <h3 class="font-bold text-base leading-tight" style="color:var(--text-primary)">{{ auth.currentUser()?.name }}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize"
                      [style]="auth.currentUser()?.role === 'admin'
                        ? 'background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.28)'
                        : 'background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.28)'">
                  <span class="w-1.5 h-1.5 rounded-full"
                        [style.background]="auth.currentUser()?.role === 'admin' ? '#818cf8' : '#22c55e'"></span>
                  {{ auth.currentUser()?.role }}
                </span>
                <span class="text-xs" style="color:var(--text-muted)">{{ auth.currentUser()?.email }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Account information ── -->
      <div class="card p-6">
        <!-- Section header -->
        <div class="flex items-center gap-3 mb-6">
          <div class="section-icon-box" style="background:rgba(34,197,94,0.15)">
            <svg class="w-4.5 h-4.5" style="width:18px;height:18px;color:#22c55e" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-sm" style="color:var(--text-primary)">{{ 'PROFILE.TITLE' | translate }}</h3>
            <p class="text-xs" style="color:var(--text-muted)">{{ 'PROFILE.SUBTITLE' | translate }}</p>
          </div>
        </div>

        <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <div class="space-y-1.5">
              <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                {{ 'PROFILE.NAME' | translate }}
              </label>
              <div class="input-icon-wrap">
                <svg class="field-ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
                <input formControlName="name" type="text" class="form-input" />
              </div>
              @if (profileForm.get('name')?.invalid && profileForm.get('name')?.touched) {
                <p class="field-error">{{ 'COACHES.FORM.NAME_REQ' | translate }}</p>
              }
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                {{ 'PROFILE.EMAIL' | translate }}
              </label>
              <div class="input-icon-wrap">
                <svg class="field-ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <input formControlName="email" type="email" class="form-input" />
              </div>
              @if (!isAdmin()) {
                <p class="text-[11px]" style="color:var(--text-muted)">{{ 'PROFILE.CONTACT_LOCKED_HINT' | translate }}</p>
              }
            </div>

            <div class="space-y-1.5 sm:col-span-2">
              <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                {{ 'PROFILE.PHONE' | translate }}
              </label>
              <div class="input-icon-wrap">
                <svg class="field-ico" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <input formControlName="phoneNumber" type="tel" class="form-input"
                       [placeholder]="'PROFILE.PHONE_PH' | translate" />
              </div>
            </div>

          </div>

          <!-- Save button -->
          <div class="flex items-center justify-end mt-6 pt-5" style="border-top:1px solid var(--border-subtle)">
            <button type="submit" class="btn btn-primary" [disabled]="profileLoading()">
              @if (profileLoading()) {
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                {{ 'PROFILE.SAVING' | translate }}
              } @else {
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                </svg>
                {{ 'PROFILE.SAVE' | translate }}
              }
            </button>
          </div>
        </form>
      </div>

      <!-- ── Security / Change password ── -->
      <div class="card p-6">
        <!-- Section header -->
        <div class="flex items-center gap-3 mb-6">
          <div class="section-icon-box" style="background:rgba(99,102,241,0.15)">
            <svg style="width:18px;height:18px;color:#818cf8" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-sm" style="color:var(--text-primary)">{{ 'PROFILE.CHANGE_PW' | translate }}</h3>
            <p class="text-xs" style="color:var(--text-muted)">{{ 'PROFILE.PW_HINT' | translate }}</p>
          </div>
        </div>

        <form [formGroup]="passwordForm" (ngSubmit)="changePassword()">
          <div class="space-y-4">

            <div class="space-y-1.5">
              <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                {{ 'PROFILE.CURRENT_PW' | translate }}
              </label>
              <div class="input-icon-wrap">
                <input formControlName="currentPassword" [type]="showCurrentPw() ? 'text' : 'password'"
                       class="form-input has-toggle" placeholder="••••••••" />
                <button type="button" class="pw-toggle" (click)="showCurrentPw.set(!showCurrentPw())"
                        [attr.aria-label]="showCurrentPw() ? 'Hide password' : 'Show password'">
                  @if (showCurrentPw()) {
                    <svg style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  } @else {
                    <svg style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  }
                </button>
              </div>
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                {{ 'PROFILE.NEW_PW' | translate }}
              </label>
              <div class="input-icon-wrap">
                <input formControlName="password" [type]="showNewPw() ? 'text' : 'password'"
                       class="form-input has-toggle" placeholder="••••••••" />
                <button type="button" class="pw-toggle" (click)="showNewPw.set(!showNewPw())"
                        [attr.aria-label]="showNewPw() ? 'Hide password' : 'Show password'">
                  @if (showNewPw()) {
                    <svg style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  } @else {
                    <svg style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  }
                </button>
              </div>
              @if (passwordForm.get('password')?.invalid && passwordForm.get('password')?.touched) {
                <p class="field-error">{{ 'PROFILE.PW_HINT' | translate }}</p>
              } @else {
                <p class="text-xs mt-1" style="color:var(--text-muted)">{{ 'PROFILE.PW_HINT' | translate }}</p>
              }
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
                {{ 'PROFILE.CONFIRM_PW' | translate }}
              </label>
              <div class="input-icon-wrap">
                <input formControlName="confirmPassword" [type]="showConfirmPw() ? 'text' : 'password'"
                       class="form-input has-toggle" placeholder="••••••••" />
                <button type="button" class="pw-toggle" (click)="showConfirmPw.set(!showConfirmPw())"
                        [attr.aria-label]="showConfirmPw() ? 'Hide password' : 'Show password'">
                  @if (showConfirmPw()) {
                    <svg style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  } @else {
                    <svg style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  }
                </button>
              </div>
            </div>

          </div>

          <!-- Update button -->
          <div class="flex items-center justify-end mt-6 pt-5" style="border-top:1px solid var(--border-subtle)">
            <button type="submit" class="btn btn-primary" [disabled]="passwordLoading()"
                    style="background:linear-gradient(135deg,#4f46e5,#6366f1);box-shadow:0 4px 14px rgba(99,102,241,0.35)">
              @if (passwordLoading()) {
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                {{ 'PROFILE.CHANGING' | translate }}
              } @else {
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                {{ 'PROFILE.CHANGE_BTN' | translate }}
              }
            </button>
          </div>
        </form>
      </div>

    </div>
  `
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly profileLoading = signal(false);
  readonly passwordLoading = signal(false);
  readonly showCurrentPw = signal(false);
  readonly showNewPw = signal(false);
  readonly showConfirmPw = signal(false);

  // الإيميل مقفول على غير الأدمن — بيتغير بس عن طريق الأدمن. رقم الموبايل قابل للتعديل عادي لأي حد.
  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  readonly profileForm = this.fb.group({
    name: [this.auth.currentUser()?.name ?? '', [Validators.required, Validators.minLength(3)]],
    email: [{ value: this.auth.currentUser()?.email ?? '', disabled: !this.isAdmin() }, [Validators.required, Validators.email]],
    phoneNumber: [this.auth.currentUser()?.phoneNumber ?? ''],
  });

  readonly passwordForm = this.fb.group({
    currentPassword: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
    confirmPassword: ['', Validators.required],
  });

  initials(): string {
    const name = this.auth.currentUser()?.name ?? '';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) { this.profileForm.markAllAsTouched(); return; }
    this.profileLoading.set(true);
    try {
      await this.auth.updateProfile(this.profileForm.value as any);
      this.toast.success(this.translate.instant('PROFILE.SAVE'));
    } finally {
      this.profileLoading.set(false);
    }
  }

  async changePassword(): Promise<void> {
    if (this.passwordForm.invalid) { this.passwordForm.markAllAsTouched(); return; }
    const { currentPassword, password, confirmPassword } = this.passwordForm.getRawValue();
    if (password !== confirmPassword) { this.toast.error(this.translate.instant('COACHES.FORM.PW_MISMATCH')); return; }
    this.passwordLoading.set(true);
    try {
      await this.auth.changePassword({ currentPassword: currentPassword!, password: password!, confirmPassword: confirmPassword! });
      this.toast.success(this.translate.instant('PROFILE.CHANGE_BTN'));
      this.passwordForm.reset();
    } finally {
      this.passwordLoading.set(false);
    }
  }
}
