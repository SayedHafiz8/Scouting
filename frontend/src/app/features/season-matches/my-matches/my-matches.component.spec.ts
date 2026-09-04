import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { MyMatchesComponent } from './my-matches.component';
import { AuthService } from '../../../core/auth/auth.service';
import { SeasonMatchService } from '../services/season-match.service';
import { PlayerService } from '../../players/services/player.service';
import { TeamService } from '../../teams/services/team.service';
import { ToastService } from '../../../core/services/toast.service';
import { User, UserRole } from '../../../core/models/user.model';
import { SeasonMatch } from '../../../core/models/season-match.model';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';

// US1 (spec.md) — a proScout sees only its scoped matches, with no age-group
// exposure and no league toggle (there is only one league for this role to
// see). This spec pins that against the role that already existed
// (coach/observer/admin) alongside the new proScout branch, since
// my-matches.component.ts had no baseline spec before this stage
// (research.md R7).

let fixture: ComponentFixture<MyMatchesComponent>;
let getAllSpy: jasmine.Spy;
let attendSpy: jasmine.Spy;
let unattendSpy: jasmine.Spy;
let updateStatusSpy: jasmine.Spy;

function makeUser(role: UserRole): User {
  return {
    _id: 'scout-1',
    name: 'Test User',
    email: 't@t.com',
    role,
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeMatch(overrides: Partial<SeasonMatch> = {}): SeasonMatch {
  return {
    _id: 'm1',
    ageGroup: { _id: 'ag1', name: 'U18' } as any,
    season: '2025/2026',
    league: 'professional',
    matchDate: '2026-09-04T00:00:00.000Z',
    homeTeam: { _id: 't1', name: 'Al Ahly A' } as any,
    awayTeam: { _id: 't2', name: 'Zamalek A' } as any,
    venue: 'Cairo Stadium',
    status: 'scheduled',
    attendees: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function setup(role: UserRole, matches: SeasonMatch[] = [makeMatch()]) {
  const authStub = {
    currentUser: signal<User | null>(makeUser(role)),
    isAdmin: signal(role === 'admin'),
    isCoach: signal(role === 'coach'),
    isObserver: signal(role === 'observer'),
    isProScout: signal(role === 'proScout'),
  };

  getAllSpy = jasmine.createSpy('getAll').and.returnValue(
    of({ status: 'success', count: matches.length, data: { documents: matches } } as unknown as
      ApiResponse<PaginatedResponse<{ documents: SeasonMatch[] }>>)
  );

  const updatedMatch = (id: string, overrides: Partial<SeasonMatch>) =>
    ({ status: 'success', data: { document: { ...matches.find(m => m._id === id), ...overrides } } });

  attendSpy = jasmine.createSpy('attend').and.callFake((id: string) =>
    of(updatedMatch(id, { attendees: ['scout-1'] }) as unknown as ApiResponse<{ document: SeasonMatch }>));
  unattendSpy = jasmine.createSpy('unattend').and.callFake((id: string) =>
    of(updatedMatch(id, { attendees: [] }) as unknown as ApiResponse<{ document: SeasonMatch }>));
  updateStatusSpy = jasmine.createSpy('updateStatus').and.callFake((id: string, payload: any) =>
    of(updatedMatch(id, payload) as unknown as ApiResponse<{ document: SeasonMatch }>));

  const seasonMatchServiceStub = {
    getAll: getAllSpy,
    getOne: jasmine.createSpy('getOne'),
    attend: attendSpy,
    unattend: unattendSpy,
    updateStatus: updateStatusSpy,
  };

  await TestBed.configureTestingModule({
    imports: [MyMatchesComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: AuthService, useValue: authStub },
      { provide: SeasonMatchService, useValue: seasonMatchServiceStub },
      { provide: PlayerService, useValue: { getAll: jasmine.createSpy('getAll').and.returnValue(of({ data: { documents: [] } })) } },
      { provide: TeamService, useValue: { getOne: jasmine.createSpy('getOne').and.returnValue(of({ data: { document: null } })) } },
      { provide: ToastService, useValue: { success: jasmine.createSpy('success'), error: jasmine.createSpy('error') } },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');

  fixture = TestBed.createComponent(MyMatchesComponent);
  fixture.detectChanges();
}

function pageText(): string {
  return (fixture.nativeElement.textContent as string) ?? '';
}

describe('MyMatchesComponent — US1 (browse professional-league matches)', () => {
  for (const role of ['coach', 'observer', 'admin'] as UserRole[]) {
    it(`${role}: age-group column and league toggle are still present (regression, FR-007)`, async () => {
      await setup(role, [makeMatch({ matchDate: '2020-01-01T00:00:00.000Z', attendees: ['scout-1'] })]);
      expect(pageText()).toContain('SEASON_MATCHES.AGE_GROUP');
      const leagueButtons = fixture.nativeElement.querySelectorAll('button[type="button"]');
      const hasLeagueToggle = Array.from(leagueButtons as NodeListOf<HTMLButtonElement>)
        .some(b => b.textContent?.includes('SEASON_MATCHES.LEAGUE_'));
      expect(hasLeagueToggle).toBeTrue();
    });
  }

  it('proScout: no age-group column or cell anywhere on the page (FR-002)', async () => {
    await setup('proScout', [makeMatch()]);
    const text = pageText();
    expect(text).not.toContain('SEASON_MATCHES.AGE_GROUP');
    expect(text).not.toContain('U18');
  });

  it('proScout: no league toggle is rendered (FR-003)', async () => {
    await setup('proScout', [makeMatch()]);
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button[type="button"]')
    ) as HTMLButtonElement[];
    const hasLeagueToggle = buttons.some(b => b.textContent?.includes('SEASON_MATCHES.LEAGUE_'));
    expect(hasLeagueToggle).toBeFalse();
  });

  it('proScout: selectedLeague() initializes to "professional", not "premier" (research.md R6)', async () => {
    await setup('proScout', [makeMatch()]);
    expect((fixture.componentInstance as any).selectedLeague()).toBe('professional');
  });

  it('proScout: load() requests the professional league (FR-001)', async () => {
    await setup('proScout', [makeMatch()]);
    const loadCall = getAllSpy.calls.allArgs().find((args: unknown[]) => (args[0] as any)?.league);
    expect(loadCall?.[0]).toEqual(jasmine.objectContaining({ league: 'professional' }));
  });

  it('coach: selectedLeague() still initializes to "premier" (regression)', async () => {
    await setup('coach', [makeMatch({ league: 'premier' })]);
    expect((fixture.componentInstance as any).selectedLeague()).toBe('premier');
  });
});

// US2 (spec.md) — attendance and result entry are already role-agnostic in this
// component (isAttending/canToggleAttend/canEnterResult key off auth.isAdmin() and
// attendee-membership, not isCoach()/isObserver() — research.md R6). These cases
// exercise that under a proScout identity for the first time, now that the backend
// route actually accepts the call (T016/T017).
describe('MyMatchesComponent — US2 (attendance and result entry)', () => {
  it('proScout: clicking "Attend" on an upcoming in-scope match calls attend() and reflects the update', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await setup('proScout', [makeMatch({ matchDate: future, attendees: [] })]);

    const attendButton = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ).find((b: any) => b.textContent?.includes('SEASON_MATCHES.ATTEND')) as HTMLButtonElement;
    expect(attendButton).toBeTruthy();

    attendButton.click();
    fixture.detectChanges();

    expect(attendSpy).toHaveBeenCalledWith('m1');
    expect((fixture.componentInstance as any).isAttending({ _id: 'm1', attendees: ['scout-1'] })).toBeTrue();
  });

  it('proScout: canEnterResult() is true only on match day while attending (unchanged method)', async () => {
    await setup('proScout', [makeMatch()]);
    const component = fixture.componentInstance as any;

    const today = new Date();
    const todayMatch = makeMatch({ matchDate: today.toISOString(), attendees: ['scout-1'] });
    const futureMatch = makeMatch({ matchDate: new Date(Date.now() + 86400000 * 10).toISOString(), attendees: ['scout-1'] });
    const notAttendingMatch = makeMatch({ matchDate: today.toISOString(), attendees: [] });

    expect(component.canEnterResult(todayMatch)).toBeTrue();
    expect(component.canEnterResult(futureMatch)).toBeFalse();
    expect(component.canEnterResult(notAttendingMatch)).toBeFalse();
  });

  it('proScout: saving a result calls updateStatus() with the entered status/result', async () => {
    await setup('proScout', [makeMatch()]);
    const component = fixture.componentInstance as any;

    component.openResultForm(makeMatch());
    component.resultForm = { status: 'completed', homeScore: 3, awayScore: 0 };
    component.saveResult(makeMatch());

    expect(updateStatusSpy).toHaveBeenCalledWith('m1', {
      status: 'completed',
      result: { homeScore: 3, awayScore: 0 },
    });
  });
});

// observer-matches-and-players, stage 2 — the client-side restriction that used to
// confine an observer to attended past matches + one upcoming match per observed
// player is gone; the backend scope change (stage 1) already opened the full
// schedule, so the frontend must stop narrowing it a second time.
describe('MyMatchesComponent — observer schedule is unrestricted (observer-matches-and-players)', () => {
  it('an observer sees an upcoming match they are not attending, unrelated to any observed player', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await setup('observer', [makeMatch({ matchDate: future, attendees: [], league: 'premier' })]);
    expect((fixture.componentInstance as any).visibleMatches().length).toBe(1);
  });

  it('an observer sees a past match they did not attend', async () => {
    await setup('observer', [makeMatch({ matchDate: '2020-01-01T00:00:00.000Z', attendees: [], league: 'premier' })]);
    expect((fixture.componentInstance as any).visibleMatches().length).toBe(1);
  });
});

// The precomputed row view-model (CLAUDE.md — no function calls inside a list-loop
// template) must expose exactly what the template renders per row.
describe('MyMatchesComponent — matchRows() view-model', () => {
  it('carries the resolved team names, age-group label and per-row flags the template reads', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await setup('coach', [makeMatch({ matchDate: future, attendees: [], league: 'premier' })]);

    const rows = (fixture.componentInstance as any).matchRows();
    expect(rows.length).toBe(1);
    expect(rows[0].homeName).toBe('Al Ahly A');
    expect(rows[0].awayName).toBe('Zamalek A');
    expect(rows[0].ageGroupLabel).toBe('U18');
    expect(rows[0].isPast).toBeFalse();
    expect(rows[0].isAttending).toBeFalse();
    expect(rows[0].canToggleAttend).toBeTrue();
    expect(rows[0].attendeeCount).toBe(0);
  });
});
