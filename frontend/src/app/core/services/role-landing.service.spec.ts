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

  // Stage 1 (ProScout Role Definition) — spec FR-006/SC-005: the role is
  // intentionally not given a dashboard in this stage, so it must fall into the
  // same default branch as any other unrecognized role.
  it('returns /unauthorized for proScout (no dashboard defined for it yet)', () => {
    expect(service.landingFor('proScout' as any)).toEqual(['/unauthorized']);
  });

  it('returns /unauthorized when role is undefined', () => {
    expect(service.landingFor(undefined)).toEqual(['/unauthorized']);
  });
});
