import { Component, HostListener, inject, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { SocketNotification } from '../../core/models/notification.model';

@Component({
    selector: 'app-notification-panel',
    imports: [DatePipe, TranslatePipe],
    styles: [':host { display: contents; }'],
    template: `
    <div class="absolute right-0 top-full mt-2 w-80 md:w-96 card shadow-lg overflow-hidden"
         style="z-index:200; box-shadow:0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px var(--border-color);"
         style="animation: slideUp 0.15s ease; max-height: 480px; display: flex; flex-direction: column;">

      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color:var(--border-color)">
        <h3 class="text-sm font-semibold" style="color:var(--text-primary)">{{ 'NOTIFICATIONS.TITLE' | translate }}</h3>
        <button class="text-xs font-medium text-primary-500 hover:text-primary-600" (click)="notifService.clear()">
          {{ 'NOTIFICATIONS.CLEAR_ALL' | translate }}
        </button>
      </div>

      <!-- List -->
      <div class="overflow-y-auto flex-1">
        @if (notifService.notifications().length === 0) {
          <div class="py-12 text-center">
            <svg class="w-10 h-10 mx-auto mb-3" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <p class="text-sm" style="color:var(--text-muted)">{{ 'NOTIFICATIONS.EMPTY' | translate }}</p>
          </div>
        }

        @for (n of notifService.notifications(); track n.createdAt) {
          <div class="px-4 py-3 border-b last:border-0 hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
               style="border-color:var(--border-subtle)"
               tabindex="0" role="button" [attr.aria-label]="notifLabel(n)"
               (click)="openDetail(n)" (keydown.enter)="openDetail(n)">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                   [class]="iconClass(n)">
                <span [innerHTML]="icon(n)"></span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium" style="color:var(--text-primary)">
                  {{ notifLabel(n) }}
                </p>
                @if (notifMessage(n); as msg) {
                  <p class="text-xs mt-0.5 line-clamp-2" style="color:var(--text-secondary)">{{ msg }}</p>
                }
                @if (n.details && n.details.length) {
                  <div class="mt-1.5 space-y-1">
                    @for (d of n.details; track d.coach) {
                      <p class="text-xs" style="color:var(--text-secondary)">
                        <span class="font-medium" style="color:var(--text-primary)">{{ d.coach }}</span>
                        added {{ d.count }} player(s)
                      </p>
                    }
                  </div>
                }
                @if (n.createdAt) {
                  <p class="text-xs mt-1" style="color:var(--text-muted)">
                    {{ n.createdAt | date:'shortTime' }}
                  </p>
                }
              </div>
            </div>
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="px-4 py-2 border-t text-center" style="border-color:var(--border-color)">
        <button class="text-xs" style="color:var(--text-muted)" (click)="close.emit()">{{ 'NOTIFICATIONS.CLOSE' | translate }}</button>
      </div>
    </div>

    <!-- Full-message detail layer -->
    @if (detail(); as n) {
      <div class="overlay-backdrop" style="z-index:300" (click)="detail.set(null)">
        <div class="fixed inset-0 flex items-center justify-center p-4 z-50">
          <div class="card max-w-sm w-full p-6" style="animation: slideUp 0.2s ease"
               (click)="$event.stopPropagation()" role="dialog" aria-modal="true" [attr.aria-labelledby]="detailTitleId">
            <div class="flex items-start gap-4 mb-4">
              <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                   [class]="iconClass(n)">
                <span [innerHTML]="icon(n)"></span>
              </div>
              <div class="flex-1 min-w-0">
                <h3 [id]="detailTitleId" class="font-semibold text-base" style="color:var(--text-primary)">
                  {{ notifLabel(n) }}
                </h3>
                @if (n.createdAt) {
                  <p class="text-xs mt-0.5" style="color:var(--text-muted)">{{ n.createdAt | date:'medium' }}</p>
                }
              </div>
              <button type="button" class="btn btn-ghost btn-icon btn-sm flex-shrink-0" [attr.aria-label]="'NOTIFICATIONS.CLOSE' | translate" (click)="detail.set(null)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            @if (notifMessage(n); as msg) {
              <p class="text-sm whitespace-pre-line leading-relaxed mb-5" style="color:var(--text-secondary)">{{ msg }}</p>
            }

            <div class="flex gap-3 justify-end">
              <button type="button" class="btn btn-secondary btn-sm" (click)="detail.set(null)">
                {{ 'NOTIFICATIONS.CLOSE' | translate }}
              </button>
              @if (notifLink(n)) {
                <button type="button" class="btn btn-primary btn-sm" (click)="navigate(n)">
                  {{ 'NOTIFICATIONS.VIEW_DETAILS' | translate }}
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class NotificationPanelComponent {
  readonly close = output<void>();
  readonly notifService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  readonly detail = signal<SocketNotification | null>(null);
  readonly detailTitleId = 'notification-detail-title';

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.detail.set(null);
  }

  openDetail(n: SocketNotification): void {
    this.detail.set(n);
  }

  private static readonly REASON_KEYS: Record<string, string> = {
    unclear_footage: 'MEDIA.REVIEW.REASONS.UNCLEAR_FOOTAGE',
    scout_name_missing: 'MEDIA.REVIEW.REASONS.SCOUT_NAME_MISSING',
    match_date_missing: 'MEDIA.REVIEW.REASONS.MATCH_DATE_MISSING',
    teams_not_specified: 'MEDIA.REVIEW.REASONS.TEAMS_NOT_SPECIFIED',
  };

  notifLink(n: SocketNotification): string | null {
    if (n.type === 'PLAYER_STATUS_UPDATED' && n.playerId) return `/players/${n.playerId}`;
    if (n.type === 'MEDIA_REJECTED' && n.playerId) return `/players/${n.playerId}`;
    if (n.type === 'DAILY_SUMMARY' || n.type === 'ADMIN_DASHBOARD_UPDATE' || n.type === 'COACH_DASHBOARD_UPDATE') return '/dashboard';
    return null;
  }

  notifMessage(n: SocketNotification): string | null {
    if (n.type === 'MEDIA_REJECTED') {
      const reasons = (n.reasonCodes ?? [])
        .map(code => NotificationPanelComponent.REASON_KEYS[code])
        .filter((key): key is string => !!key)
        .map(key => this.translate.instant(key));
      return this.translate.instant('NOTIFICATIONS.MEDIA_REJECTED_MESSAGE', {
        player: n.playerName ?? '',
        reasons: reasons.join('، '),
      });
    }
    return n.message ?? null;
  }

  navigate(n: SocketNotification): void {
    const link = this.notifLink(n);
    if (!link) return;
    this.detail.set(null);
    this.close.emit();
    if (n.type === 'PLAYER_STATUS_UPDATED' && n.status === 'selected') {
      this.router.navigate([link], { queryParams: { celebrate: 'selected' } });
    } else {
      this.router.navigateByUrl(link);
    }
  }

  notifLabel(n: SocketNotification): string {
    switch (n.type) {
      case 'DAILY_SUMMARY': return 'Daily Summary';
      case 'PLAYER_STATUS_UPDATED': return 'Player Status Changed';
      case 'ADMIN_DASHBOARD_UPDATE': return 'Dashboard Updated';
      case 'COACH_DASHBOARD_UPDATE': return 'Dashboard Updated';
      case 'MEDIA_REJECTED': return this.translate.instant('NOTIFICATIONS.MEDIA_REJECTED_LABEL');
      default: return 'Notification';
    }
  }

  iconClass(n: SocketNotification): string {
    const map: Record<string, string> = {
      DAILY_SUMMARY: 'bg-primary-100 text-primary-600',
      PLAYER_STATUS_UPDATED: 'bg-accent-100 text-accent-600',
      ADMIN_DASHBOARD_UPDATE: 'bg-surface-100 text-surface-600',
      COACH_DASHBOARD_UPDATE: 'bg-surface-100 text-surface-600',
      MEDIA_REJECTED: 'bg-danger-100 text-danger-600',
    };
    return map[n.type] ?? 'bg-surface-100 text-surface-600';
  }

  icon(n: SocketNotification): string {
    if (n.type === 'DAILY_SUMMARY') return '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    if (n.type === 'PLAYER_STATUS_UPDATED') return '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    if (n.type === 'MEDIA_REJECTED') return '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    return '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>';
  }
}
