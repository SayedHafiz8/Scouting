import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { NotificationPanelComponent } from './notification-panel.component';
import { NotificationService } from '../../core/services/notification.service';
import { SocketNotification } from '../../core/models/notification.model';

// Frontend audit fix B1 — the notification icon (list row + detail modal) used
// to be [innerHTML]-bound to an SVG string, which Angular's sanitizer strips
// (svg/path/circle aren't in its HTML allowlist). Assert real <svg> elements
// render in both places.
describe('NotificationPanelComponent', () => {
  async function setup(notifications: SocketNotification[]) {
    await TestBed.configureTestingModule({
      imports: [NotificationPanelComponent],
      providers: [provideRouter([]), provideTranslateService({ lang: 'en', fallbackLang: 'en' })],
    }).compileComponents();

    TestBed.inject(TranslateService).use('en');
    TestBed.inject(NotificationService).notifications.set(notifications);

    const fixture = TestBed.createComponent(NotificationPanelComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a real SVG icon in the notification list row', async () => {
    const fixture = await setup([{ type: 'DAILY_SUMMARY', createdAt: '2026-01-01T00:00:00.000Z' }]);
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.querySelector('polyline[points="14 2 14 8 20 8"]')).toBeTruthy();
  });

  it('renders a real SVG icon in the detail modal, matching the notification type', async () => {
    const fixture = await setup([{ type: 'PLAYER_STATUS_UPDATED', createdAt: '2026-01-01T00:00:00.000Z', playerId: 'p1' }]);
    const row = fixture.nativeElement.querySelector('[role="button"]');
    row.click();
    fixture.detectChanges();

    const modalIcon = fixture.nativeElement.querySelector('[role="dialog"] svg');
    expect(modalIcon).toBeTruthy();
    expect(modalIcon.querySelector('polyline[points="22 4 12 14.01 9 11.01"]')).toBeTruthy();
  });
});
