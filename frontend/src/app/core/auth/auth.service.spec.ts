import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { SocketService } from '../services/socket.service';
import { User } from '../models/user.model';

const mockUser: User = {
  _id: 'user123',
  name: 'Test Coach',
  email: 'coach@test.com',
  role: 'coach',
  active: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let socketSpy: jasmine.SpyObj<SocketService>;

  beforeEach(() => {
    socketSpy = jasmine.createSpyObj<SocketService>('SocketService', ['connect', 'disconnect']);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SocketService, useValue: socketSpy },
      ],
    });

    service  = TestBed.inject(AuthService);
    http     = TestBed.inject(HttpTestingController);
    sessionStorage.clear();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  // ── Initial state ──────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('starts with no user and no token', () => {
      expect(service.currentUser()).toBeNull();
      expect(service.accessToken()).toBeNull();
    });

    it('isAuthenticated returns false initially', () => {
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('isAdmin returns false initially', () => {
      expect(service.isAdmin()).toBeFalse();
    });

    it('isCoach returns false initially', () => {
      expect(service.isCoach()).toBeFalse();
    });
  });

  // ── login() ───────────────────────────────────────────────────────────────
  describe('login()', () => {
    it('sets currentUser and accessToken after successful login', async () => {
      const loginPromise = service.login({ email: 'coach@test.com', password: 'Test@1234' });
      const req = http.expectOne(req => req.url.includes('/auth/login'));
      req.flush({ status: 'success', data: { user: mockUser, accessToken: 'tok123' } });
      await loginPromise;

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.accessToken()).toBe('tok123');
    });

    it('calls socketService.connect after login', async () => {
      const loginPromise = service.login({ email: 'coach@test.com', password: 'Test@1234' });
      const req = http.expectOne(req => req.url.includes('/auth/login'));
      req.flush({ status: 'success', data: { user: mockUser, accessToken: 'tok123' } });
      await loginPromise;

      expect(socketSpy.connect).toHaveBeenCalledWith('tok123');
    });

    it('stores user in sessionStorage after login', async () => {
      const loginPromise = service.login({ email: 'coach@test.com', password: 'Test@1234' });
      const req = http.expectOne(req => req.url.includes('/auth/login'));
      req.flush({ status: 'success', data: { user: mockUser, accessToken: 'tok123' } });
      await loginPromise;

      const stored = JSON.parse(sessionStorage.getItem('tr_user')!);
      expect(stored.email).toBe('coach@test.com');
    });

    it('isAuthenticated returns true after login', async () => {
      const loginPromise = service.login({ email: 'coach@test.com', password: 'Test@1234' });
      const req = http.expectOne(req => req.url.includes('/auth/login'));
      req.flush({ status: 'success', data: { user: mockUser, accessToken: 'tok123' } });
      await loginPromise;

      expect(service.isAuthenticated()).toBeTrue();
    });

    it('isCoach returns true for coach user', async () => {
      const loginPromise = service.login({ email: 'coach@test.com', password: 'Test@1234' });
      const req = http.expectOne(req => req.url.includes('/auth/login'));
      req.flush({ status: 'success', data: { user: mockUser, accessToken: 'tok123' } });
      await loginPromise;

      expect(service.isCoach()).toBeTrue();
      expect(service.isAdmin()).toBeFalse();
    });

    it('isAdmin returns true for admin user', async () => {
      const adminUser = { ...mockUser, role: 'admin' as const };
      const loginPromise = service.login({ email: 'admin@test.com', password: 'Test@1234' });
      const req = http.expectOne(req => req.url.includes('/auth/login'));
      req.flush({ status: 'success', data: { user: adminUser, accessToken: 'tok_admin' } });
      await loginPromise;

      expect(service.isAdmin()).toBeTrue();
      expect(service.isCoach()).toBeFalse();
    });
  });

  // ── logout() ──────────────────────────────────────────────────────────────
  describe('logout()', () => {
    beforeEach(async () => {
      // Set up a session first
      service.setSession(mockUser, 'tok123');
    });

    it('clears user and token after logout', async () => {
      const logoutPromise = service.logout();
      const req = http.expectOne(req => req.url.includes('/auth/logout'));
      req.flush({ status: 'success' });
      await logoutPromise;

      expect(service.currentUser()).toBeNull();
      expect(service.accessToken()).toBeNull();
    });

    it('clears sessionStorage on logout', async () => {
      const logoutPromise = service.logout();
      const req = http.expectOne(req => req.url.includes('/auth/logout'));
      req.flush({ status: 'success' });
      await logoutPromise;

      expect(sessionStorage.getItem('tr_user')).toBeNull();
    });

    it('calls socketService.disconnect on logout', async () => {
      const logoutPromise = service.logout();
      const req = http.expectOne(req => req.url.includes('/auth/logout'));
      req.flush({ status: 'success' });
      await logoutPromise;

      expect(socketSpy.disconnect).toHaveBeenCalled();
    });

    it('still clears session even if server logout request fails', async () => {
      const logoutPromise = service.logout();
      const req = http.expectOne(req => req.url.includes('/auth/logout'));
      req.error(new ProgressEvent('error'));
      await logoutPromise.catch(() => {}); // ignore error

      // Session should still be cleared (finally block)
      expect(service.currentUser()).toBeNull();
    });
  });

  // ── refreshAccessToken() ──────────────────────────────────────────────────
  describe('refreshAccessToken()', () => {
    it('updates accessToken from server response', async () => {
      const refreshPromise = service.refreshAccessToken();
      const req = http.expectOne(req => req.url.includes('/auth/refreshToken'));
      req.flush({ status: 'success', data: { accessToken: 'new_tok', user: mockUser } });
      const token = await refreshPromise;

      expect(token).toBe('new_tok');
      expect(service.accessToken()).toBe('new_tok');
    });

    it('updates currentUser from refresh response', async () => {
      const refreshPromise = service.refreshAccessToken();
      const req = http.expectOne(req => req.url.includes('/auth/refreshToken'));
      req.flush({ status: 'success', data: { accessToken: 'new_tok', user: mockUser } });
      await refreshPromise;

      expect(service.currentUser()).toEqual(mockUser);
    });
  });

  // ── setSession() / clearSession() ─────────────────────────────────────────
  describe('setSession() and clearSession()', () => {
    it('setSession sets user, token and calls socket.connect', () => {
      service.setSession(mockUser, 'direct_tok');

      expect(service.currentUser()).toEqual(mockUser);
      expect(service.accessToken()).toBe('direct_tok');
      expect(socketSpy.connect).toHaveBeenCalledWith('direct_tok');
    });

    it('clearSession nulls user and token', () => {
      service.setSession(mockUser, 'tok');
      service.clearSession();

      expect(service.currentUser()).toBeNull();
      expect(service.accessToken()).toBeNull();
      expect(socketSpy.disconnect).toHaveBeenCalled();
    });
  });
});
