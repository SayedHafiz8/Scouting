import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';

// صفحة "غير مصرّح" — الوجهة الافتراضية لأي رول بلا وجهة معرّفة (FR-005..FR-008).
// عمداً خارج ShellComponent/authGuard في app.routes.ts: السايدبار نفسه مبني على
// افتراض رول صالح، وهو بالظبط الشرط الناقص هنا (research.md §6).
@Component({
  selector: 'app-unauthorized',
  imports: [TranslatePipe],
  template: `
    <div class="flex items-center justify-center min-h-screen p-6" style="background:var(--bg-primary, #0f172a)">
      <div class="max-w-md w-full text-center card p-8">
        <h1 class="text-2xl font-semibold mb-3">{{ 'UNAUTHORIZED.TITLE' | translate }}</h1>
        <p class="mb-6 opacity-80">{{ 'UNAUTHORIZED.MESSAGE' | translate }}</p>
        <button type="button" class="btn-primary px-4 py-2 rounded-lg" (click)="logout()">
          {{ 'UNAUTHORIZED.LOGOUT' | translate }}
        </button>
      </div>
    </div>
  `,
})
export class UnauthorizedComponent {
  private readonly auth = inject(AuthService);

  logout(): void {
    this.auth.logout();
  }
}
