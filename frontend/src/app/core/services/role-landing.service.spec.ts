import { TestBed } from '@angular/core/testing';
import { RoleLandingService } from './role-landing.service';

describe('RoleLandingService', () => {
  let service: RoleLandingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RoleLandingService);
  });

  it('returns /dashboard/admin for admin', () => {
    expect(service.landingFor('admin')).toEqual(['/dashboard/admin']);
  });

  it('returns /dashboard/coach for coach', () => {
    expect(service.landingFor('coach')).toEqual(['/dashboard/coach']);
  });

  it('returns /dashboard/observer for observer', () => {
    expect(service.landingFor('observer')).toEqual(['/dashboard/observer']);
  });

  it('returns /unauthorized for an unknown role', () => {
    expect(service.landingFor('not-a-real-role' as any)).toEqual(['/unauthorized']);
  });

  it('returns /unauthorized when role is undefined', () => {
    expect(service.landingFor(undefined)).toEqual(['/unauthorized']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// proScout landing — DF-001
//
// Stage 1 asserted /unauthorized here: the role had zero data access, so the
// default branch was the correct answer. Stage 4 gave it a working, fully
// guarded /players page, at which point that assertion became the reason a
// successful login ended on a refusal screen.
//
// ⚠️ /players is TEMPORARY. Stage 5 must EDIT the existing 'proScout' case to
// return /dashboard/proScout — not add a second case for the same role.
// ═══════════════════════════════════════════════════════════════════════════
describe('RoleLandingService — proScout (DF-001, temporary until Stage 5)', () => {
  let service: RoleLandingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RoleLandingService);
  });

  it('lands proScout on /players', () => {
    expect(service.landingFor('proScout')).toEqual(['/players']);
  });

  it('does NOT land proScout on /unauthorized — a successful login must not end on a refusal', () => {
    // This is the assertion that would have caught the reported bug.
    expect(service.landingFor('proScout')).not.toEqual(['/unauthorized']);
  });

  it('proScout no longer shares the unknown-role default', () => {
    // Guards against a future refactor that deletes the case and silently
    // reinstates the redirect, since /unauthorized is what the default returns.
    expect(service.landingFor('proScout')).not.toEqual(service.landingFor('not-a-real-role' as any));
  });

  it('the other three roles are untouched by this case', () => {
    // Principle III — adding a branch must not perturb the existing ones.
    expect(service.landingFor('admin')).toEqual(['/dashboard/admin']);
    expect(service.landingFor('coach')).toEqual(['/dashboard/coach']);
    expect(service.landingFor('observer')).toEqual(['/dashboard/observer']);
    expect(service.landingFor(undefined)).toEqual(['/unauthorized']);
  });
});
