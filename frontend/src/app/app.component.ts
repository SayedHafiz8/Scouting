import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/auth/auth.service';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, ToastContainerComponent],
    template: `
    @if (!auth.isReady()) {
      <!-- Splash screen while auth initializes -->
      <div class="splash-screen" style="background:var(--bg-secondary)">
        <div class="splash-content">
          <img src="/assets/logo.png" alt="Talent Radar" class="splash-logo-img" />
          <div class="splash-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    } @else {
      <router-outlet />
      <app-toast-container />
    }
  `,
    styles: [`
    .splash-screen {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.2s ease;
    }

    .splash-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .splash-logo-img {
      width: 260px;
      height: auto;
      object-fit: contain;
      animation: pulse 1.8s ease-in-out infinite;
    }

    .splash-dots {
      display: flex;
      gap: 8px;
    }

    .splash-dots span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
      animation: bounce 1.2s ease-in-out infinite;
    }

    .splash-dots span:nth-child(1) { animation-delay: 0s; }
    .splash-dots span:nth-child(2) { animation-delay: 0.2s; }
    .splash-dots span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1);   box-shadow: 0 8px 32px rgba(34,197,94,0.35); }
      50%       { transform: scale(1.06); box-shadow: 0 12px 40px rgba(34,197,94,0.50); }
    }

    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0);    opacity: 0.4; }
      40%            { transform: translateY(-8px); opacity: 1;   }
    }
  `]
})
export class AppComponent {
  private readonly _theme = inject(ThemeService);
  readonly auth = inject(AuthService);
}
