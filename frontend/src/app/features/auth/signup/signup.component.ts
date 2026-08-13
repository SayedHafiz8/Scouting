import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

function passwordMatchValidator(control: AbstractControl) {
  const password = control.get('password')?.value;
  const confirm = control.get('passwordConfirm')?.value;
  return password === confirm ? null : { passwordMismatch: true };
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center p-4" style="background:var(--bg-secondary)">
      <div class="w-full max-w-md">

        <div class="text-center mb-8">
          <div class="w-14 h-14 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-card-lg">
            <svg class="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
          </div>
          <h1 class="text-2xl font-bold" style="color:var(--text-primary)">Create account</h1>
          <p class="text-sm mt-1" style="color:var(--text-secondary)">Join Talent Radar as a coach</p>
        </div>

        <div class="card p-8">
          <form [formGroup]="form" (ngSubmit)="submit()">

            <div class="mb-4">
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">Full name</label>
              <input type="text" formControlName="name" class="form-input" placeholder="Ahmed Hassan" autocomplete="name" />
              @if (form.get('name')?.invalid && form.get('name')?.touched) {
                <p class="field-error">Name must be at least 3 characters</p>
              }
            </div>

            <div class="mb-4">
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">Email</label>
              <input type="email" formControlName="email" class="form-input" placeholder="coach@example.com" autocomplete="email" />
              @if (form.get('email')?.invalid && form.get('email')?.touched) {
                <p class="field-error">Please enter a valid email</p>
              }
            </div>

            <div class="mb-4">
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">Phone number <span class="text-[var(--text-muted)]">(Egyptian)</span></label>
              <input type="tel" formControlName="phoneNumber" class="form-input" placeholder="01XXXXXXXXX" autocomplete="tel" />
              @if (form.get('phoneNumber')?.invalid && form.get('phoneNumber')?.touched) {
                <p class="field-error">Enter a valid Egyptian number (01XXXXXXXXX)</p>
              }
            </div>

            <div class="mb-4">
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">Password</label>
              <input type="password" formControlName="password" class="form-input" placeholder="••••••••" autocomplete="new-password" />
              @if (form.get('password')?.invalid && form.get('password')?.touched) {
                <p class="field-error">Min 8 chars, 1 uppercase, 1 lowercase, 1 digit</p>
              }
            </div>

            <div class="mb-6">
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">Confirm password</label>
              <input type="password" formControlName="passwordConfirm" class="form-input" placeholder="••••••••" autocomplete="new-password" />
              @if (form.hasError('passwordMismatch') && form.get('passwordConfirm')?.touched) {
                <p class="field-error">Passwords do not match</p>
              }
            </div>

            <button type="submit" class="btn btn-primary w-full" [disabled]="loading()">
              @if (loading()) {
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              }
              {{ loading() ? 'Creating account...' : 'Create account' }}
            </button>
          </form>

          <p class="text-center text-sm mt-6" style="color:var(--text-secondary)">
            Already have an account?
            <a routerLink="/auth/login" class="text-primary-600 hover:text-primary-700 font-medium ml-1">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^01[0125][0-9]{8}$/)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
    passwordConfirm: ['', Validators.required],
  }, { validators: passwordMatchValidator });

  async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    try {
      await this.auth.signup(this.form.getRawValue() as any);
      this.router.navigate(['/dashboard/coach']);
    } finally {
      this.loading.set(false);
    }
  }
}
