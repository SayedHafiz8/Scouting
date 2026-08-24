import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { RolePreloadStrategy, PRELOAD_SCHEDULER } from './role-preload.strategy';
import { AuthService } from '../auth/auth.service';
import { User } from '../models/user.model';

function makeUser(role: User['role']): User {
  return {
    _id: 'u1', name: 'Test', email: 't@t.com', role, active: true,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('RolePreloadStrategy', () => {
  function setup(role: User['role'] | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        // Deterministic under Karma — run the scheduled task synchronously
        // instead of waiting on requestIdleCallback/setTimeout.
        { provide: PRELOAD_SCHEDULER, useValue: (task: () => void) => task() },
        { provide: AuthService, useValue: { currentUser: signal(role ? makeUser(role) : null) } },
      ],
    });
    return TestBed.inject(RolePreloadStrategy);
  }

  function preloadAndCollect(strategy: RolePreloadStrategy, route: Route, load: () => Observable<unknown>) {
    let loaded = false;
    let completed = false;
    strategy.preload(route, () => { loaded = true; return load(); }).subscribe({ complete: () => (completed = true) });
    return { loaded, completed };
  }

  it('does not preload a route with no preloadRoles marker when there is no signed-in user', () => {
    const strategy = setup(null);
    const { loaded, completed } = preloadAndCollect(strategy, {}, () => of(null));
    expect(loaded).toBeFalse();
    expect(completed).toBeTrue(); // EMPTY still completes — must not stall the router's preload chain
  });

  it('preloads a route with no preloadRoles marker for any signed-in role (shared route)', () => {
    const strategy = setup('coach');
    const { loaded } = preloadAndCollect(strategy, {}, () => of(null));
    expect(loaded).toBeTrue();
  });

  it('skips an admin-only route for a coach', () => {
    const strategy = setup('coach');
    const { loaded } = preloadAndCollect(strategy, { data: { preloadRoles: ['admin'] } }, () => of(null));
    expect(loaded).toBeFalse();
  });

  it('preloads an admin-only route for an admin', () => {
    const strategy = setup('admin');
    const { loaded } = preloadAndCollect(strategy, { data: { preloadRoles: ['admin'] } }, () => of(null));
    expect(loaded).toBeTrue();
  });

  it('preloads a multi-role route for each listed role', () => {
    const route: Route = { data: { preloadRoles: ['admin', 'observer'] } };
    expect(preloadAndCollect(setup('observer'), route, () => of(null)).loaded).toBeTrue();
    expect(preloadAndCollect(setup('coach'), route, () => of(null)).loaded).toBeFalse();
  });

  it('completes without erroring when the deferred load() throws', () => {
    const strategy = setup('admin');
    let errored = false;
    let completed = false;
    strategy.preload({}, () => throwError(() => new Error('chunk load failed')))
      .subscribe({ error: () => (errored = true), complete: () => (completed = true) });
    expect(errored).toBeFalse();
    expect(completed).toBeTrue();
  });
});
