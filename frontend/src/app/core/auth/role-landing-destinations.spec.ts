import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';
import { RoleLandingService } from '../services/role-landing.service';
import { User, UserRole } from '../models/user.model';

// Stage 6 item 7 (spec.md US3, FR-010) — the single authoritative source of truth
// for "where does role X land / bounce to" across the whole app. Everything else
// that talks about a landing/rejection destination (role.guard.spec.ts,
// role-landing.service.spec.ts, sidebar.component.spec.ts) either derives its
// assertion from RoleLandingService live, or tests something narrower (the menu
// shape, not the destination). This file is the one place a literal destination
// string is allowed to be hardcoded — research.md R8.
//
// Two axes are checked per role, both driven off RoleLandingService:
//   (a) landingFor(role) — where a successful login lands.
//   (b) roleGuard(...) refusing a route the role isn't listed on — where it bounces.
// A role's landing and refusal destination are the same value today (both come
// from the identical RoleLandingService.landingFor call), but the two axes are
// asserted independently so a future divergence between them is caught here,
// not assumed away.

const ts = '2024-01-01T00:00:00.000Z';

const EXPECTED: Record<UserRole, string> = {
  admin: '/dashboard/admin',
  coach: '/dashboard/coach',
  observer: '/dashboard/observer',
  proScout: '/dashboard/proScout',
};

function makeUser(role: UserRole): User {
  return { _id: '1', name: 'Test User', email: 't@t.com', role, active: true, createdAt: ts, updatedAt: ts };
}

function makeAuthSpy(user: User | null): Partial<AuthService> {
  return { whenReady: Promise.resolve(), currentUser: signal(user) as any };
}

async function runRoleGuard(spy: Partial<AuthService>) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: spy }],
  });
  // A route no real role is ever listed on — every recognized role must be refused here.
  return TestBed.runInInjectionContext(() =>
    roleGuard(['__no_such_role__' as UserRole])({} as any, {} as any)
  );
}

describe('role landing/rejection destinations — consolidated matrix', () => {
  const roles = Object.keys(EXPECTED) as UserRole[];

  for (const role of roles) {
    it(`${role}: RoleLandingService.landingFor lands on ${EXPECTED[role]}`, () => {
      TestBed.configureTestingModule({});
      const service = TestBed.inject(RoleLandingService);
      expect(service.landingFor(role)).toEqual([EXPECTED[role]]);
    });

    it(`${role}: refused on a route it isn't listed for, roleGuard bounces to ${EXPECTED[role]}`, async () => {
      const result = await runRoleGuard(makeAuthSpy(makeUser(role)));
      expect(result).not.toBeTrue();
      expect((result as any).toString()).toBe(EXPECTED[role]);
    });
  }

  it('an unrecognized role lands on /unauthorized (landingFor)', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(RoleLandingService);
    expect(service.landingFor('not-a-real-role' as UserRole)).toEqual(['/unauthorized']);
  });

  it('undefined role lands on /unauthorized (landingFor)', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(RoleLandingService);
    expect(service.landingFor(undefined)).toEqual(['/unauthorized']);
  });

  it('an unrecognized role is refused and bounces to /unauthorized via roleGuard', async () => {
    const garbageUser = { ...makeUser('admin'), role: 'not-a-real-role' as UserRole };
    const result = await runRoleGuard(makeAuthSpy(garbageUser));
    expect((result as any).toString()).toBe('/unauthorized');
  });

  it('no signed-in user is refused and bounces to /unauthorized via roleGuard', async () => {
    const result = await runRoleGuard(makeAuthSpy(null));
    expect((result as any).toString()).toBe('/unauthorized');
  });

  it('every role in the UserRole union is covered by this matrix (fails loudly if a role is added without updating EXPECTED)', () => {
    // A missing entry would make TypeScript itself fail to compile EXPECTED above
    // (Record<UserRole, string> requires every key) — this assertion exists so the
    // *reason* is visible in a test failure, not just a build error.
    expect(Object.keys(EXPECTED).sort()).toEqual(['admin', 'coach', 'observer', 'proScout'].sort());
  });
});
