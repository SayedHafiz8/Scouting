import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';
import { ToastContainerComponent } from '../../shared/components/toast-container/toast-container.component';
import { SocketService } from '../../core/services/socket.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
    selector: 'app-shell',
    imports: [RouterOutlet, SidebarComponent, HeaderComponent, ToastContainerComponent],
    template: `
    <div class="flex h-screen overflow-hidden" style="position:relative;z-index:1">
      <!-- Sidebar -->
      <app-sidebar [collapsed]="sidebarCollapsed()" (toggleSidebar)="toggleSidebar()" />

      <!-- Mobile overlay -->
      @if (!sidebarCollapsed() && isMobile()) {
        <div class="overlay-backdrop lg:hidden" (click)="sidebarCollapsed.set(true)"></div>
      }

      <!-- Main content -->
      <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
        <app-header
          (menuToggle)="toggleSidebar()"
          [sidebarCollapsed]="sidebarCollapsed()"
        />
        <main class="flex-1 overflow-auto p-4 md:p-6">
          <router-outlet />
        </main>
      </div>
    </div>

    <app-toast-container />
  `
})
export class ShellComponent implements OnInit {
  private readonly socketService = inject(SocketService);
  private readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastService);
  private readonly authService = inject(AuthService);

  readonly sidebarCollapsed = signal(window.innerWidth < 1024);
  readonly isMobile = signal(window.innerWidth < 1024);

  constructor() {
    this.socketService.getNotifications()
      .pipe(takeUntilDestroyed())
      .subscribe(notification => {
        this.notificationService.add(notification);
        if (notification.message) {
          this.toastService.info(notification.message);
        }
      });

    this.socketService.getPlayerStatusUpdates()
      .pipe(takeUntilDestroyed())
      .subscribe(({ playerId, status }) => {
        const msg = `Player status changed to: ${status}`;
        this.toastService.info(msg);
        this.notificationService.add({ type: 'PLAYER_STATUS_UPDATED', message: msg, playerId, status });
      });
  }

  ngOnInit(): void {
    window.addEventListener('resize', () => {
      const mobile = window.innerWidth < 1024;
      this.isMobile.set(mobile);
      if (!mobile) this.sidebarCollapsed.set(false);
    });
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }
}
