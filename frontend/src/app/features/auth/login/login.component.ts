import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
    selector: 'app-login',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
    template: `
    <div class="min-h-screen flex items-center justify-center p-4"
         style="background:var(--bg-secondary)">
      <div class="w-full max-w-md">

        <!-- Brand -->
        <div class="text-center mb-6">
          <img src="/assets/logo.png" alt="Talent Radar"
               style="height:52px;width:auto;object-fit:contain;
                      filter:brightness(0) invert(1) sepia(1) saturate(4) hue-rotate(98deg);
                      display:block;margin:0 auto 12px;" />
          <h1 class="text-2xl font-bold" style="color:var(--text-primary)">{{ 'AUTH.WELCOME' | translate }}</h1>
          <p class="text-sm mt-1"        style="color:var(--text-secondary)">{{ 'AUTH.SIGN_IN_SUBTITLE' | translate }}</p>
        </div>

        <!-- Card -->
        <div class="card overflow-hidden" style="position:relative;">

          <!-- Background image + dark overlay -->
          <div style="
            position:absolute;inset:0;
            background-image: linear-gradient(
              to bottom,
              rgba(7,15,28,0.55) 0%,
              rgba(7,15,28,0.72) 100%
            ), url('/assets/player-bg.jpg');
            background-size:cover;
            background-position:center top;
            pointer-events:none;">
          </div>

          <!-- Form -->
          <div class="p-8" style="position:relative;z-index:1;">
            <form [formGroup]="form" (ngSubmit)="submit()">

              <div class="mb-5">
                <label class="block text-sm font-medium mb-1.5"
                       style="color:rgba(255,255,255,0.92)">{{ 'AUTH.EMAIL' | translate }}</label>
                <input type="email" formControlName="email" class="form-input"
                       style="background:rgba(255,255,255,0.10);
                              border-color:rgba(255,255,255,0.20);
                              color:#fff;"
                       [placeholder]="'AUTH.EMAIL_PH' | translate" autocomplete="email" />
                @if (form.get('email')?.invalid && form.get('email')?.touched) {
                  <p class="field-error">{{ 'AUTH.EMAIL_ERR' | translate }}</p>
                }
              </div>

              <div class="mb-6">
                <div class="flex justify-between mb-1.5">
                  <label class="text-sm font-medium"
                         style="color:rgba(255,255,255,0.92)">{{ 'AUTH.PASSWORD' | translate }}</label>
                  <a routerLink="/auth/forgot-password"
                     class="text-sm font-medium" style="color:#4ade80;">
                    {{ 'AUTH.FORGOT' | translate }}
                  </a>
                </div>
                <input type="password" formControlName="password" class="form-input"
                       style="background:rgba(255,255,255,0.10);
                              border-color:rgba(255,255,255,0.20);
                              color:#fff;"
                       [placeholder]="'AUTH.PASSWORD_PH' | translate" autocomplete="current-password" />
                @if (form.get('password')?.invalid && form.get('password')?.touched) {
                  <p class="field-error">{{ 'AUTH.PASSWORD_ERR' | translate }}</p>
                }
              </div>

              <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
                @if (loading()) {
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10"
                            stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                }
                {{ (loading() ? 'AUTH.SIGNING_IN' : 'AUTH.SIGN_IN') | translate }}
              </button>

            </form>

            <!-- Spacer so image shows below form -->
            <div style="height:120px;"></div>
          </div>

        </div>
      </div>
    </div>
  `
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);

  readonly form = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    try {
      await this.auth.login(this.form.getRawValue() as any);

      // دايمًا يفتح على الداش بورد بعد تسجيل الدخول — /dashboard بيحدد الصفحة المناسبة حسب الدور
      this.router.navigateByUrl('/dashboard');
    } finally {
      this.loading.set(false);
    }
  }
}
