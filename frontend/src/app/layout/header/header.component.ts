import { Component, inject, input, output, signal, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { NotificationService } from '../../core/services/notification.service';
import { LanguageService } from '../../core/services/language.service';
import { NotificationPanelComponent } from '../notification-panel/notification-panel.component';

@Component({
    selector: 'app-header',
    imports: [RouterLink, NotificationPanelComponent, TranslatePipe],
    template: `
    <header class="flex items-center justify-between px-4 md:px-6 py-3 border-b shrink-0"
            style="background:rgba(7,13,26,0.85); border-color:var(--border-color); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); position:relative; z-index:100;">

      <!-- Left: hamburger + logo + title -->
      <div class="flex items-center gap-3">
        <button class="btn btn-ghost btn-icon lg:hidden" (click)="menuToggle.emit()" aria-label="Toggle menu">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        <div class="flex items-center gap-2">
          <div style="height:32px;overflow:hidden;flex-shrink:0">
            <img src="/assets/logo.png" alt="Talent Radar"
                 style="height:58px;width:auto;display:block;margin-top:-2px;" />
          </div>
          <h1 class="text-base font-semibold hidden sm:block" style="color:var(--text-primary)">Talent Radar</h1>
        </div>
      </div>

      <!-- Right: actions -->
      <div class="flex items-center gap-2 relative">

        <!-- Language toggle -->
        <button class="btn btn-ghost btn-sm font-semibold tracking-wide text-xs px-2.5"
                style="color:var(--text-secondary);font-variant-numeric:tabular-nums"
                (click)="langService.toggle()"
                [title]="'LANG.SWITCH' | translate">
          {{ 'LANG.CURRENT' | translate }}
        </button>

        <!-- Theme toggle -->
        <button class="btn btn-ghost btn-icon" (click)="themeService.toggleTheme()" [attr.aria-label]="'Switch to ' + (themeService.theme() === 'dark' ? 'light' : 'dark') + ' mode'">
          @if (themeService.theme() === 'dark') {
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          } @else {
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          }
        </button>

        <!-- Notifications bell -->
        <button class="btn btn-ghost btn-icon relative" (click)="toggleNotifications($event)" aria-label="Notifications">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          @if (notifService.unreadCount() > 0) {
            <span class="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-danger-500 text-white text-[10px] font-bold flex items-center justify-center">
              {{ notifService.unreadCount() > 9 ? '9+' : notifService.unreadCount() }}
            </span>
          }
        </button>

        <!-- User dropdown -->
        <div class="relative">
          <button class="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-card-hover)]"
                  style="color:var(--text-primary)"
                  (click)="toggleUserMenu($event)">
            <div class="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-primary-300/40">
              {{ userInitials() }}
            </div>
            <span class="hidden md:block text-sm font-medium">{{ auth.currentUser()?.name }}</span>
          </button>

          @if (userMenuOpen()) {
            <div class="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-lg z-50 overflow-hidden card py-1"
                 style="animation: slideUp 0.15s ease">
              <a routerLink="/profile" class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-card-hover)]"
                 style="color:var(--text-primary)" (click)="userMenuOpen.set(false)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                Profile
              </a>
              <hr style="border-color:var(--border-color)" class="my-1"/>
              <button class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger-500 transition-colors hover:bg-danger-50 dark:hover:bg-danger-500/10 text-left"
                      (click)="logout()">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign out
              </button>
            </div>
          }
        </div>

        <!-- Notification panel -->
        @if (notifPanelOpen()) {
          <app-notification-panel (close)="notifPanelOpen.set(false)" />
        }
      </div>
    </header>
  `
})
export class HeaderComponent {
  readonly menuToggle = output<void>();
  readonly sidebarCollapsed = input<boolean>(false);

  readonly auth = inject(AuthService);
  readonly themeService = inject(ThemeService);
  readonly notifService = inject(NotificationService);
  readonly langService = inject(LanguageService);
  private readonly router = inject(Router);

  readonly userMenuOpen = signal(false);
  readonly notifPanelOpen = signal(false);

  toggleUserMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.userMenuOpen.update(v => !v);
  }

  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();
    this.notifPanelOpen.update(v => !v);
    if (this.notifPanelOpen()) this.notifService.markAllRead();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.notifPanelOpen()) this.notifPanelOpen.set(false);
    if (this.userMenuOpen()) this.userMenuOpen.set(false);
  }

  userInitials(): string {
    const name = this.auth.currentUser()?.name ?? '';
    return name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  }

  async logout(): Promise<void> {
    this.userMenuOpen.set(false);
    await this.auth.logout();
  }
}
