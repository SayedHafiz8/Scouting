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
let playersGetAllSpy: jasmine.Spy;

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
    of({
      status: 'success', count: matches.length,
      data: { documents: matches },
      pagination: { currentPage: 1, limit: 20, numberOfPages: 1 },
    } as unknown as ApiResponse<PaginatedResponse<{ documents: SeasonMatch[] }>>)
  );

  const updatedMatch = (id: string, overrides: Partial<SeasonMatch>) =>
    ({ status: 'success', data: { document: { ...matches.find(m => m._id === id), ...overrides } } });

  attendSpy = jasmine.createSpy('attend').and.callFake((id: string) =>
    of(updatedMatch(id, { attendees: ['scout-1'] }) as unknown as ApiResponse<{ document: SeasonMatch }>));
  unattendSpy = jasmine.createSpy('unattend').and.callFake((id: string) =>
    of(updatedMatch(id, { attendees: [] }) as unknown as ApiResponse<{ document: SeasonMatch }>));
  updateStatusSpy = jasmine.createSpy('updateStatus').and.callFake((id: string, payload: any) =>
    of(updatedMatch(id, payload) as unknown as ApiResponse<{ document: SeasonMatch }>));

  playersGetAllSpy = jasmine.createSpy('players.getAll').and.returnValue(of({ data: { documents: [] } }));

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
      { provide: PlayerService, useValue: { getAll: playersGetAllSpy } },
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

// "الدوري الممتار" used to be one flat tab; it's now one tab per age group that
// actually has a premier match recorded, derived from the same unfiltered
// season-list fetch (no extra request per age group).
describe('MyMatchesComponent — premier tabs are per-age-group (observer-matches-and-players)', () => {
  it('renders one tab per distinct age group that has a premier match, sorted by birth year', async () => {
    await setup('coach', [
      makeMatch({ _id: 'm1', league: 'premier', ageGroup: { _id: 'ag2012', name: '2012', birthYear: 2012 } as any }),
      makeMatch({ _id: 'm2', league: 'premier', ageGroup: { _id: 'ag2010', name: '2010', birthYear: 2010 } as any }),
      makeMatch({ _id: 'm3', league: 'premier', ageGroup: { _id: 'ag2012', name: '2012', birthYear: 2012 } as any }),
    ]);
    const tabs = (fixture.componentInstance as any).premierAgeGroupTabs();
    expect(tabs.map((t: any) => t._id)).toEqual(['ag2010', 'ag2012']);
  });

  it('an age group with zero premier matches gets no tab (nothing to derive it from)', async () => {
    await setup('coach', [makeMatch({ league: 'professional' })]);
    expect((fixture.componentInstance as any).premierAgeGroupTabs()).toEqual([]);
  });

  it('defaults to the earliest tab and requests that ageGroup on the initial load', async () => {
    await setup('coach', [
      makeMatch({ _id: 'm1', league: 'premier', ageGroup: { _id: 'ag2012', name: '2012', birthYear: 2012 } as any }),
      makeMatch({ _id: 'm2', league: 'premier', ageGroup: { _id: 'ag2010', name: '2010', birthYear: 2010 } as any }),
    ]);
    const component = fixture.componentInstance as any;
    expect(component.selectedAgeGroupId()).toBe('ag2010');
    const loadCall = getAllSpy.calls.allArgs().find((args: unknown[]) => (args[0] as any)?.ageGroup);
    expect(loadCall?.[0]).toEqual(jasmine.objectContaining({ league: 'premier', ageGroup: 'ag2010' }));
  });

  it('selecting a different age-group tab re-requests with that ageGroup', async () => {
    await setup('coach', [
      makeMatch({ _id: 'm1', league: 'premier', ageGroup: { _id: 'ag2012', name: '2012', birthYear: 2012 } as any }),
      makeMatch({ _id: 'm2', league: 'premier', ageGroup: { _id: 'ag2010', name: '2010', birthYear: 2010 } as any }),
    ]);
    const component = fixture.componentInstance as any;
    getAllSpy.calls.reset();

    component.selectAgeGroupTab({ _id: 'ag2012', name: '2012', birthYear: 2012 });

    expect(component.selectedAgeGroupId()).toBe('ag2012');
    expect(getAllSpy).toHaveBeenCalledWith(jasmine.objectContaining({ league: 'premier', ageGroup: 'ag2012' }));
  });

  it('selecting the professional tab clears the age-group filter', async () => {
    await setup('coach', [
      makeMatch({ _id: 'm1', league: 'premier', ageGroup: { _id: 'ag2010', name: '2010', birthYear: 2010 } as any }),
    ]);
    const component = fixture.componentInstance as any;

    component.selectLeague('professional');

    expect(component.selectedAgeGroupId()).toBeNull();
    expect(getAllSpy).toHaveBeenCalledWith(jasmine.objectContaining({ league: 'professional' }));
  });

  it('proScout never computes premier tabs (no toggle to feed)', async () => {
    await setup('proScout', [makeMatch({ league: 'professional' })]);
    expect((fixture.componentInstance as any).premierAgeGroupTabs()).toEqual([]);
  });
});

// Pagination — the schedule used to fetch every match matching the current
// filters in one request (limit defaulted server-side to 50); it now pages at
// 20, and "attending only" moved from a client-side filter to a server-side
// ?attendees=<id> filter so it isn't blind to matches sitting on a page that
// was never fetched.
describe('MyMatchesComponent — pagination (observer-matches-and-players)', () => {
  it('load() requests page 1 at the fixed page size', async () => {
    await setup('coach', [makeMatch({ league: 'professional' })]);
    (fixture.componentInstance as any).selectLeague('professional');
    const loadCall = getAllSpy.calls.mostRecent();
    expect(loadCall.args[0]).toEqual(jasmine.objectContaining({ page: 1, limit: 20 }));
  });

  it('changePage() requests the new page and updates page()', async () => {
    await setup('coach', [makeMatch({ league: 'professional' })]);
    const component = fixture.componentInstance as any;
    component.selectLeague('professional');
    getAllSpy.calls.reset();

    component.changePage(3);

    expect(component.page()).toBe(3);
    expect(getAllSpy).toHaveBeenCalledWith(jasmine.objectContaining({ page: 3, limit: 20 }));
  });

  it('changing the season resets to page 1', async () => {
    await setup('coach', [makeMatch({ league: 'professional' })]);
    const component = fixture.componentInstance as any;
    component.selectLeague('professional');
    component.changePage(2);
    expect(component.page()).toBe(2);

    component.onSeasonFilterChange();
    expect(component.page()).toBe(1);
  });

  it('switching age-group tabs resets to page 1', async () => {
    await setup('coach', [
      makeMatch({ _id: 'm1', league: 'premier', ageGroup: { _id: 'ag2012', name: '2012', birthYear: 2012 } as any }),
      makeMatch({ _id: 'm2', league: 'premier', ageGroup: { _id: 'ag2010', name: '2010', birthYear: 2010 } as any }),
    ]);
    const component = fixture.componentInstance as any;
    component.changePage(2);
    expect(component.page()).toBe(2);

    component.selectAgeGroupTab({ _id: 'ag2012', name: '2012', birthYear: 2012 });
    expect(component.page()).toBe(1);
  });

  it('"attending only" filters server-side via ?attendees=<me>, not client-side', async () => {
    await setup('coach', [makeMatch({ league: 'professional' })]);
    const component = fixture.componentInstance as any;
    component.selectLeague('professional');
    getAllSpy.calls.reset();

    component.onAttendingOnlyChange(true);

    expect(component.page()).toBe(1);
    expect(getAllSpy).toHaveBeenCalledWith(jasmine.objectContaining({ attendees: 'scout-1' }));
  });

  it('admin never sends ?attendees=, even if attendingOnly() were somehow set', async () => {
    await setup('admin', [makeMatch({ league: 'professional' })]);
    const component = fixture.componentInstance as any;
    component.attendingOnly.set(true);
    getAllSpy.calls.reset();

    component.load();

    const call = getAllSpy.calls.mostRecent().args[0];
    expect(call.attendees).toBeUndefined();
  });

  it('visibleMatches() is a pass-through of matches() — no second client-side filter', async () => {
    await setup('coach', [makeMatch({ league: 'professional' })]);
    const component = fixture.componentInstance as any;
    expect(component.visibleMatches()).toBe(component.matches());
  });
});

// Perf audit — the "my observed players" panel is collapsed by default, but its
// data load (GET /players, then GET /teams/:id per team, then GET /seasonMatches
// per age group — ~11 requests in 3 sequential waves) used to fire unconditionally
// in ngOnInit. It now loads on first expand, once.
describe('MyMatchesComponent — observed-players panel loads lazily', () => {
  it('does not request observed players on init, while the panel is collapsed', async () => {
    await setup('observer', [makeMatch({ league: 'professional' })]);
    expect((fixture.componentInstance as any).observedOpen()).toBeFalse();
    expect(playersGetAllSpy).not.toHaveBeenCalled();
  });

  it('requests them on the first expand', async () => {
    await setup('observer', [makeMatch({ league: 'professional' })]);
    (fixture.componentInstance as any).toggleObservedPanel();

    expect((fixture.componentInstance as any).observedOpen()).toBeTrue();
    expect(playersGetAllSpy).toHaveBeenCalledTimes(1);
  });

  it('does not re-request on collapse and re-expand', async () => {
    await setup('observer', [makeMatch({ league: 'professional' })]);
    const component = fixture.componentInstance as any;

    component.toggleObservedPanel();   // open  → loads
    component.toggleObservedPanel();   // close
    component.toggleObservedPanel();   // open again → no new request

    expect(component.observedOpen()).toBeTrue();
    expect(playersGetAllSpy).toHaveBeenCalledTimes(1);
  });

  it('a coach never touches that panel at all', async () => {
    await setup('coach', [makeMatch({ league: 'professional' })]);
    expect(playersGetAllSpy).not.toHaveBeenCalled();
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
