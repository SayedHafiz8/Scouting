import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';
import { User, UserRole } from '../models/user.model';

const ts = '2024-01-01T00:00:00.000Z';
const coachUser: User = { _id: '1', name: 'Coach', email: 'c@t.com', role: 'coach', active: true, createdAt: ts, updatedAt: ts };
const adminUser: User = { _id: '2', name: 'Admin', email: 'a@t.com', role: 'admin', active: true, createdAt: ts, updatedAt: ts };
const proScoutUser: User = { _id: '3', name: 'Scout', email: 's@t.com', role: 'proScout', active: true, createdAt: ts, updatedAt: ts };

function makeAuthSpy(user: User | null): Partial<AuthService> {
  return {
    whenReady: Promise.resolve(),
    currentUser: signal(user) as any,
  };
}

async function runRoleGuard(spy: Partial<AuthService>, allowedRoles: UserRole[]) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: spy },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    roleGuard(allowedRoles)({} as any, {} as any)
  );
}

describe('roleGuard', () => {
  it('allows coach to access coach-only route', async () => {
    const result = await runRoleGuard(makeAuthSpy(coachUser), ['coach']);
    expect(result).toBeTrue();
  });

  it('allows admin to access admin-only route', async () => {
    const result = await runRoleGuard(makeAuthSpy(adminUser), ['admin']);
    expect(result).toBeTrue();
  });

  it('blocks coach from admin-only route and redirects to /dashboard/coach', async () => {
    const result = await runRoleGuard(makeAuthSpy(coachUser), ['admin']);
    expect(result).not.toBeTrue();
    // UrlTree.toString() yields the URL path string
    expect(result.toString()).toBe('/dashboard/coach');
  });

  it('blocks admin from coach-only route and redirects to /dashboard/admin', async () => {
    const result = await runRoleGuard(makeAuthSpy(adminUser), ['coach']);
    expect(result).not.toBeTrue();
    expect(result.toString()).toBe('/dashboard/admin');
  });

  it('allows both roles when both are in the allowed list', async () => {
    const result = await runRoleGuard(makeAuthSpy(coachUser), ['coach', 'admin']);
    expect(result).toBeTrue();
  });

  it('redirects when no user is set (null)', async () => {
    const result = await runRoleGuard(makeAuthSpy(null), ['admin']);
    // null user → role undefined → fallback redirect
    expect(result).not.toBeTrue();
  });

  it('redirects an unknown role to /unauthorized instead of guessing a dashboard (FR-007)', async () => {
    const unknownRoleUser = { ...coachUser, role: 'not-a-real-role' } as unknown as User;
    const result = await runRoleGuard(makeAuthSpy(unknownRoleUser), ['admin']);
    expect(result).not.toBeTrue();
    expect(result.toString()).toBe('/unauthorized');
  });

  it('redirects a null user (no role at all) to /unauthorized', async () => {
    const result = await runRoleGuard(makeAuthSpy(null), ['admin']);
    expect(result.toString()).toBe('/unauthorized');
  });

  // Phase 3 (proScout navigation) — US4/FR-012: direct navigation to the three
  // administration areas is refused via the same single RoleLandingService used
  // above, not a new hand-written condition (FR-013).
  //
  // ⚠️ Updated in Stage 4 (DF-001). These previously asserted `/unauthorized`,
  // which was correct only while proScout had no landing destination and fell
  // into the unknown-role default. It now has one (`/players`, temporary until
  // Stage 5), so a refusal bounces it to its own landing — exactly what already
  // happens to a coach or observer refused an admin-only route.
  //
  // The security property under test is unchanged and is what these assert:
  // **the guard does not grant access.** Which page the refusal lands on is a UX
  // detail; `/unauthorized` is the destination for *unrecognized* roles, and
  // proScout is no longer one of those.
  const refusedProScout = async () => {
    const result = await runRoleGuard(makeAuthSpy(proScoutUser), ['admin']);
    expect(result).not.toBeTrue();
    return result.toString();
  };

  it('refuses proScout on /users (admin-only) and bounces it to its landing', async () => {
    expect(await refusedProScout()).toBe('/players');
  });

  it('refuses proScout on /observers (admin-only) and bounces it to its landing', async () => {
    expect(await refusedProScout()).toBe('/players');
  });

  it('refuses proScout on /age-groups (admin-only) and bounces it to its landing', async () => {
    expect(await refusedProScout()).toBe('/players');
  });

  it('never returns true for proScout on an admin-only route, whatever the landing is', async () => {
    // The assertion that must survive Stage 5 changing the landing destination.
    const result = await runRoleGuard(makeAuthSpy(proScoutUser), ['admin']);
    expect(result).not.toBeTrue();
  });

  it('still grants proScout a route it IS listed for', async () => {
    const result = await runRoleGuard(makeAuthSpy(proScoutUser), ['admin', 'proScout']);
    expect(result).toBeTrue();
  });
});
