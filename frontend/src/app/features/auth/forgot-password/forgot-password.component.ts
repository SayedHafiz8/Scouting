import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
    selector: 'app-forgot-password',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
    template: `
    <div class="min-h-screen flex items-center justify-center p-4" style="background:var(--bg-secondary)">
      <div class="w-full max-w-md">

        <div class="text-center mb-8">
          <div class="w-14 h-14 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-card-lg">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold" style="color:var(--text-primary)">
            {{ (step() === 1 ? 'AUTH.RESET_TITLE' : step() === 2 ? 'AUTH.CHECK_EMAIL' : 'AUTH.NEW_PW') | translate }}
          </h1>
          <p class="text-sm mt-1" style="color:var(--text-secondary)">
            {{ (step() === 1 ? 'AUTH.RESET_STEP1' : step() === 2 ? 'AUTH.RESET_STEP2' : 'AUTH.RESET_STEP3') | translate }}
          </p>
        </div>

        <!-- Step indicator -->
        <div class="flex items-center justify-center gap-2 mb-6">
          @for (s of [1,2,3]; track s) {
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
                   [class]="s <= step() ? 'bg-primary-500 text-white' : 'bg-[var(--border-color)] text-[var(--text-muted)]'">
                {{ s < step() ? '✓' : s }}
              </div>
              @if (s < 3) {
                <div class="w-8 h-0.5 transition-colors"
                     [class]="s < step() ? 'bg-primary-500' : 'bg-[var(--border-color)]'"></div>
              }
            </div>
          }
        </div>

        <div class="card p-8">

          <!-- Step 1: Email -->
          @if (step() === 1) {
            <form [formGroup]="emailForm" (ngSubmit)="submitEmail()">
              <div class="mb-6">
                <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'AUTH.EMAIL_ADDR' | translate }}</label>
                <input type="email" formControlName="email" class="form-input" [placeholder]="'AUTH.EMAIL_PH' | translate" />
                @if (emailForm.get('email')?.invalid && emailForm.get('email')?.touched) {
                  <p class="field-error">{{ 'AUTH.EMAIL_ERR' | translate }}</p>
                }
              </div>
              <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
                {{ (loading() ? 'AUTH.SENDING' : 'AUTH.SEND_CODE') | translate }}
              </button>
            </form>
          }

          <!-- Step 2: Code -->
          @if (step() === 2) {
            <form [formGroup]="codeForm" (ngSubmit)="submitCode()">
              <div class="mb-6">
                <label class="block text-sm font-medium mb-2" style="color:var(--text-primary)">{{ 'AUTH.CODE_LABEL' | translate }}</label>
                <p class="text-xs mb-3" style="color:var(--text-secondary)">
                  Check your email at <strong>{{ emailForm.get('email')?.value }}</strong>
                </p>
                <input type="text" formControlName="resetCode" class="form-input text-center text-xl tracking-[0.5em] font-bold"
                       [placeholder]="'AUTH.CODE_PH' | translate" maxlength="6" inputmode="numeric" />
                @if (codeForm.get('resetCode')?.invalid && codeForm.get('resetCode')?.touched) {
                  <p class="field-error">{{ 'AUTH.CODE_ERR' | translate }}</p>
                }
              </div>
              <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
                {{ (loading() ? 'AUTH.VERIFYING' : 'AUTH.VERIFY') | translate }}
              </button>
            </form>
          }

          <!-- Step 3: New Password -->
          @if (step() === 3) {
            <form [formGroup]="passwordForm" (ngSubmit)="submitPassword()">
              <div class="mb-4">
                <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'AUTH.NEW_PW' | translate }}</label>
                <input type="password" formControlName="newPassword" class="form-input" [placeholder]="'AUTH.PASSWORD_PH' | translate" />
                @if (passwordForm.get('newPassword')?.invalid && passwordForm.get('newPassword')?.touched) {
                  <p class="field-error">{{ 'AUTH.PW_HINT' | translate }}</p>
                }
              </div>
              <div class="mb-6">
                <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'AUTH.CONFIRM_PW' | translate }}</label>
                <input type="password" formControlName="confirmPassword" class="form-input" [placeholder]="'AUTH.PASSWORD_PH' | translate" />
              </div>
              <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
                {{ (loading() ? 'AUTH.SAVING' : 'AUTH.SET_PW') | translate }}
              </button>
            </form>
          }

          <p class="text-center text-sm mt-6" style="color:var(--text-secondary)">
            <a routerLink="/auth/login" class="text-primary-600 hover:text-primary-700 font-medium">{{ 'AUTH.BACK_TO_SIGNIN' | translate }}</a>
          </p>
        </div>
      </div>
    </div>
  `
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly step = signal<1 | 2 | 3>(1);
  readonly loading = signal(false);

  readonly emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly codeForm = this.fb.group({
    resetCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly passwordForm = this.fb.group({
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
    confirmPassword: ['', Validators.required],
  });

  async submitEmail(): Promise<void> {
    if (this.emailForm.invalid) { this.emailForm.markAllAsTouched(); return; }
    this.loading.set(true);
    try {
      await this.auth.forgotPassword(this.emailForm.get('email')!.value!);
      this.step.set(2);
    } finally {
      this.loading.set(false);
    }
  }

  async submitCode(): Promise<void> {
    if (this.codeForm.invalid) { this.codeForm.markAllAsTouched(); return; }
    this.loading.set(true);
    try {
      await this.auth.verifyResetCode(this.codeForm.get('resetCode')!.value!);
      this.step.set(3);
    } finally {
      this.loading.set(false);
    }
  }

  async submitPassword(): Promise<void> {
    if (this.passwordForm.invalid) { this.passwordForm.markAllAsTouched(); return; }
    const { newPassword, confirmPassword } = this.passwordForm.getRawValue();
    if (newPassword !== confirmPassword) return;
    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.emailForm.get('email')!.value!, newPassword!);
      this.router.navigate(['/dashboard']);
    } finally {
      this.loading.set(false);
    }
  }
}
