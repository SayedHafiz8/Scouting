import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { ReportFormComponent } from './report-form.component';
import { ScoutingReportService } from '../services/scouting-report.service';
import { PlayerService } from '../../players/services/player.service';
import { SeasonMatchService } from '../../season-matches/services/season-match.service';
import { TeamService } from '../../teams/services/team.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';

// A professional player has no ageGroup at all — playedModel skips the derivation
// for them. loadScopedOptions() used to key entirely off the age group, so it
// returned before loading anything for such a player: no teams for the opponent
// picker, and no fixtures, which made an official report impossible to link even
// when a professional fixture was scheduled that same day. It now scopes those
// two lookups by league instead, the way player-form.component.ts already does,
// and the way the server already scopes a proScout in teamScopeFor /
// seasonMatchScopeFor.

let fixture: ComponentFixture<ReportFormComponent>;
let teamsGetAllSpy: jasmine.Spy;
let matchesGetAllSpy: jasmine.Spy;
let createSpy: jasmine.Spy;

const PRO_TEAM = { _id: 'proteam1', name: 'Pro Home Club' };
const YOUTH_TEAM = { _id: 'youthteam1', name: 'Youth Club' };

// التقييمات الـ15 مطلوبة كلها (Validators.min(1)) وقيمتها الابتدائية 0، فـsubmit()
// بيرجع قبل ما ينده create لو مااتملّتش. التستات اللي بتفحص شكل الـpayload كانت
// ناسية ده فكانت بتفشل على createSpy.calls.mostRecent() = undefined.
function fillRatings(comp: any): void {
  comp.form.patchValue({
    technical: { turning: 8, dribbling: 8, tackling: 8, twoFooted: 8, longPassing: 8, shortPassing: 8, heading: 8 },
    physical: { shortSprints: 8, longSprints: 8, agility: 8, aerialDuels: 8, groundDuels: 8 },
    mental: { vision: 8, personality: 8, movement: 8 },
  });
}

function makeMatch(id: string, home: any, away: any) {
  return {
    _id: id, season: '2026/2027', league: 'professional',
    homeTeam: home, awayTeam: away, matchDate: new Date().toISOString(),
    status: 'scheduled', attendees: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function setup(player: any, todaysMatches: any[] = [], teams: any[] = [], isAdmin = false) {
  teamsGetAllSpy = jasmine.createSpy('teams.getAll').and.returnValue(
    of({ status: 'success', count: teams.length, pagination: null, data: { documents: teams } })
  );
  matchesGetAllSpy = jasmine.createSpy('matches.getAll').and.returnValue(
    of({ status: 'success', count: todaysMatches.length, pagination: null, data: { documents: todaysMatches } })
  );
  createSpy = jasmine.createSpy('create').and.returnValue(of({ status: 'success', data: { document: { _id: 'r1' } } }));

  await TestBed.configureTestingModule({
    imports: [ReportFormComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: PlayerService, useValue: { getOne: () => of({ status: 'success', data: { document: player } }) } },
      { provide: TeamService, useValue: { getAll: teamsGetAllSpy } },
      { provide: SeasonMatchService, useValue: { getAll: matchesGetAllSpy } },
      {
        provide: ScoutingReportService,
        useValue: { getOne: jasmine.createSpy('getOne'), create: createSpy, update: jasmine.createSpy('update') },
      },
      { provide: ToastService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy() } },
      {
        provide: AuthService,
        useValue: {
          isAdmin: signal(isAdmin),
          isCoach: signal(false), isObserver: signal(false), isProScout: signal(false),
          currentUser: signal(isAdmin ? { _id: 'admin1', role: 'admin' } : null),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({}),
            pathFromRoot: [{ paramMap: convertToParamMap({ playerId: 'p1' }) }],
          },
        },
      },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');
  fixture = TestBed.createComponent(ReportFormComponent);
  fixture.detectChanges();
  return fixture.componentInstance;
}

const professionalPlayer = (overrides: any = {}) => ({
  _id: 'p1', name: 'Pro Player', isProfessional: true, ageGroup: null, team: PRO_TEAM, ...overrides,
});

const youthPlayer = (overrides: any = {}) => ({
  _id: 'p1', name: 'Youth Player', isProfessional: false,
  ageGroup: { _id: 'ag2012', name: '2012', birthYear: 2012 }, team: YOUTH_TEAM, ...overrides,
});

describe('ReportFormComponent — professional players are scoped by league, not age group', () => {
  it('requests the professional team list for a professional player', async () => {
    await setup(professionalPlayer());
    expect(teamsGetAllSpy).toHaveBeenCalledWith(undefined, 'professional');
  });

  it('requests the professional fixture list, not an age-group one', async () => {
    await setup(professionalPlayer());

    expect(matchesGetAllSpy).toHaveBeenCalled();
    const filters = matchesGetAllSpy.calls.mostRecent().args[0];
    expect(filters.league).toBe('professional');
    expect(filters.ageGroup).toBeUndefined();
  });

  it("surfaces today's professional fixture for the player's own club", async () => {
    const comp = await setup(
      professionalPlayer(),
      [makeMatch('m1', PRO_TEAM, { _id: 'other', name: 'Pro Away Club' })]
    );

    expect(comp.hasTeam()).toBeTrue();
    expect(comp.seasonMatchOptionsLoaded()).toBeTrue();
    expect(comp.seasonMatchOptions().length).toBe(1);
    expect(comp.seasonMatchOptions()[0]._id).toBe('m1');
  });

  it("ignores a fixture that belongs to another club, same as before", async () => {
    const comp = await setup(
      professionalPlayer(),
      [makeMatch('m2', { _id: 'x', name: 'X' }, { _id: 'y', name: 'Y' })]
    );
    expect(comp.seasonMatchOptions().length).toBe(0);
  });

  it('loads opponent options for a professional player, excluding their own club', async () => {
    const comp = await setup(
      professionalPlayer(),
      [],
      [PRO_TEAM, { _id: 'proteam2', name: 'Pro Away Club' }]
    );

    expect(comp.teamOptions().length).toBe(1);
    expect(comp.teamOptions()[0]._id).toBe('proteam2');
  });

  it('loads options for a professional player with no club at all', async () => {
    const comp = await setup(
      professionalPlayer({ team: null }),
      [],
      [PRO_TEAM, { _id: 'proteam2', name: 'Pro Away Club' }]
    );

    expect(comp.hasTeam()).toBeFalse();
    // مفيش فريق للاعب، فمفيش فريق يتشال من القايمة — الاتنين متاحين للإدخال اليدوي
    expect(comp.teamOptions().length).toBe(2);
    expect(teamsGetAllSpy).toHaveBeenCalledWith(undefined, 'professional');
  });
});

// A proScout is not tied to match day — the server grants the same licence in
// resolveMatchTypeFields. The form therefore offers every fixture the club has
// already played, newest first, instead of today's only.
describe('ReportFormComponent — a professional player can be reported on at any time', () => {
  it("asks for every fixture already played, not just today's", async () => {
    await setup(professionalPlayer());

    const filters = matchesGetAllSpy.calls.mostRecent().args[0];
    expect(filters['matchDate[lte]']).toBeTruthy();   // لحد النهارده
    expect(filters['matchDate[gte]']).toBeUndefined(); // من غير حد أدنى — أي تاريخ فات
    expect(filters.sort).toBe('-matchDate');           // الأحدث الأول
  });

  it('offers the fixture list and the manual opponent picker together while nothing is picked', async () => {
    const comp = await setup(
      professionalPlayer(),
      [makeMatch('m1', PRO_TEAM, { _id: 'other', name: 'Pro Away Club' })]
    );

    expect(comp.showFixturePicker()).toBeTrue();
    expect(comp.showOpponentPicker()).toBeTrue();
    // المحترف مالوش فئة عمرية — اختيار "لعب مع فئة" مابيظهرش له
    expect(comp.showAgeGroupPicker()).toBeFalse();
  });

  it('hides the manual opponent picker once a fixture is picked', async () => {
    const comp = await setup(
      professionalPlayer(),
      [makeMatch('m1', PRO_TEAM, { _id: 'other', name: 'Pro Away Club' })]
    );

    comp.onSeasonMatchChange('m1');
    fixture.detectChanges();

    expect(comp.selectedSeasonMatch()).toBe('m1');
    expect(comp.showOpponentPicker()).toBeFalse();
  });

  it('still offers the manual opponent picker when the club has played nothing yet', async () => {
    const comp = await setup(professionalPlayer(), []);
    expect(comp.showFixturePicker()).toBeFalse();
    expect(comp.showOpponentPicker()).toBeTrue();
  });
});

describe('ReportFormComponent — youth players keep the age-group scope unchanged', () => {
  // طلب مالك 2026-09 — النافذة بقت النهاردة أو امبارح، والأحدث الأول عشان
  // الربط التلقائي يختار ماتش النهاردة قبل ماتش امبارح.
  it('asks for fixtures in a bounded window, newest first', async () => {
    await setup(youthPlayer());

    const filters = matchesGetAllSpy.calls.mostRecent().args[0];
    expect(filters['matchDate[gte]']).toBeTruthy();
    expect(filters['matchDate[lte]']).toBeTruthy();
    expect(filters.sort).toBe('-matchDate');
  });

  // طلب مالك 2026-09 — قايمة اختيار المباراة اتشالت للناشئ: بتترتبط تلقائي
  it('links the fixture automatically when there is one — no picker at all', async () => {
    const comp = await setup(
      youthPlayer(),
      [makeMatch('ym1', YOUTH_TEAM, { _id: 'yother', name: 'Other Youth Club' })]
    );

    expect(comp.showFixturePicker()).toBeFalse();
    expect(comp.selectedSeasonMatch()).toBe('ym1');
    expect(comp.showLinkedMatch()).toBeTrue();
    expect(comp.showOpponentPicker()).toBeFalse();
  });

  // طلب مالك 2026-09 — بدل "تدريب/ودية": يختار الفئة اللي لعب معاها والمنافس
  it('asks which age group he played with when there is no match today', async () => {
    const comp = await setup(youthPlayer(), []);
    expect(comp.showFixturePicker()).toBeFalse();
    expect(comp.showOpponentPicker()).toBeTrue();
    expect(comp.showAgeGroupPicker()).toBeTrue();
  });

  it('requests teams by age group, with no league filter', async () => {
    await setup(youthPlayer());
    expect(teamsGetAllSpy).toHaveBeenCalledWith('ag2012', undefined);
  });

  it('requests fixtures by age group, with no league filter', async () => {
    await setup(youthPlayer());
    const filters = matchesGetAllSpy.calls.mostRecent().args[0];
    expect(filters.ageGroup).toBe('ag2012');
    expect(filters.league).toBeUndefined();
  });

  it('a youth player with no age group still loads nothing — unchanged bail-out', async () => {
    const comp = await setup(youthPlayer({ ageGroup: null }));

    expect(teamsGetAllSpy).not.toHaveBeenCalled();
    expect(matchesGetAllSpy).not.toHaveBeenCalled();
    expect(comp.teamOptionsLoaded()).toBeTrue();
    expect(comp.seasonMatchOptionsLoaded()).toBeTrue();
  });
});

// admin-assign-players-reports-media — the "file on behalf of" picker.
describe('ReportFormComponent — admin "file on behalf of" picker', () => {
  const obs = [{ _id: 'o1', name: 'Observer One' }, { _id: 'o2', name: 'Observer Two' }];

  it('is populated from the player\'s own observers[] for an admin', async () => {
    const comp = await setup(youthPlayer({ observers: obs }), [], [], true);
    expect(comp.playerObservers().length).toBe(2);
  });

  it('is empty for a non-admin, regardless of the player\'s observers', async () => {
    const comp = await setup(youthPlayer({ observers: obs }), [], [], false);
    expect(comp.playerObservers().length).toBe(0);
  });

  it('sends assignedObserver on submit only when an admin picked one', async () => {
    const comp = await setup(youthPlayer({ observers: obs, team: null }), [], [], true);
    comp.assignedObserver.set('o1');
    comp.onTeamSelectChange('home', comp.OTHER_TEAM);
    comp.onTeamSelectChange('away', comp.OTHER_TEAM);
    (comp as any).form.patchValue({ homeTeamName: 'A', awayTeamName: 'B' });
    fillRatings(comp);

    comp.submit();

    const payload = createSpy.calls.mostRecent().args[1];
    expect(payload.assignedObserver).toBe('o1');
  });

  it('omits assignedObserver on submit when the admin left it on "myself"', async () => {
    const comp = await setup(youthPlayer({ observers: obs, team: null }), [], [], true);
    comp.onTeamSelectChange('home', comp.OTHER_TEAM);
    comp.onTeamSelectChange('away', comp.OTHER_TEAM);
    (comp as any).form.patchValue({ homeTeamName: 'A', awayTeamName: 'B' });
    fillRatings(comp);

    comp.submit();

    const payload = createSpy.calls.mostRecent().args[1];
    expect(payload.assignedObserver).toBeUndefined();
  });

  it('a non-admin submit never carries assignedObserver, even with stray local state', async () => {
    const comp = await setup(youthPlayer({ observers: obs, team: null }), [], [], false);
    (comp as any).assignedObserver.set('o1'); // should never happen via the UI (block isn't rendered)
    comp.onTeamSelectChange('home', comp.OTHER_TEAM);
    comp.onTeamSelectChange('away', comp.OTHER_TEAM);
    (comp as any).form.patchValue({ homeTeamName: 'A', awayTeamName: 'B' });
    fillRatings(comp);

    comp.submit();

    const payload = createSpy.calls.mostRecent().args[1];
    expect(payload.assignedObserver).toBeUndefined();
  });
});
