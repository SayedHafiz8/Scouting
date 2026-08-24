import { TestBed } from '@angular/core/testing';
import { SocketService } from './socket.service';
import { AdminDashboard } from '../models/dashboard.model';
import { SocketNotification } from '../models/notification.model';

describe('SocketService — Subjects survive disconnect/reconnect', () => {
  let service: SocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SocketService);
  });

  // Regression test for the bug fixed here: disconnect() used to call
  // Subject.complete() on every stream. Since this service is providedIn:
  // 'root' (one instance per tab), that permanently killed realtime delivery
  // after the very first logout — any subsequent login in the same tab left
  // notifications and dashboard updates silently dead.
  it('keeps delivering notifications after disconnect (logout) then a fresh subscribe (login)', () => {
    service.disconnect(); // simulates logout — no socket was ever connected, same code path

    const seen: SocketNotification[] = [];
    service.getNotifications().subscribe(n => seen.push(n));

    const payload: SocketNotification = { type: 'DAILY_SUMMARY', message: 'hello' };
    service.notification$.next(payload);

    expect(seen).toEqual([payload]);
  });

  it('keeps delivering admin dashboard updates after disconnect then a fresh subscribe', () => {
    service.disconnect();

    const seen: AdminDashboard[] = [];
    service.getAdminUpdates().subscribe(u => seen.push(u));

    const payload = { totalPlayers: 1 } as AdminDashboard;
    service.adminDashboardUpdate$.next(payload);

    expect(seen).toEqual([payload]);
  });

  it('survives repeated disconnect() calls without ever completing the streams', () => {
    service.disconnect();
    service.disconnect();
    service.disconnect();

    const seen: SocketNotification[] = [];
    let completed = false;
    service.getNotifications().subscribe({
      next: n => seen.push(n),
      complete: () => (completed = true),
    });

    service.notification$.next({ type: 'DAILY_SUMMARY' });

    expect(completed).toBeFalse();
    expect(seen.length).toBe(1);
  });
});
