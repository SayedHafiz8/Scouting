import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { BehaviorSubject, Subject, of } from 'rxjs';

import { PlayerListComponent } from './player-list.component';
import { PlayerService } from '../services/player.service';
import { ScoutingReportService } from '../../scouting-reports/services/scouting-report.service';
import { TeamService } from '../../teams/services/team.service';
import { AuthService } from '../../../core/auth/auth.service';
import type { Player } from '../../../core/models/player.model';

// §9 — عدسة "اللاعبين اليتامى" في قايمة اللاعبين. أدمن-فقط، وبتبعت ?coach=none
// اللي الباكإند بيترجمه لـ{coach: null} (شوف PLAYER_ADMIN_ONLY_LENSES).

let fixture: ComponentFixture<PlayerListComponent>;
let compiled: HTMLElement;
let getAllSpy: jasmine.Spy;
let navigateSpy: jasmine.Spy;
let queryParams$: BehaviorSubject<any>;

type TestRole = 'admin' | 'coach' | 'observer' | 'proScout';

let countsSpy: jasmine.Spy;
let teamsGetAllSpy: jasmine.Spy;
let httpMock: HttpTestingController;

async function setup(
  role: TestRole = 'admin',
  params: Record<string, string> = {},
  countsResponse: { counts: Record<string, number>; total: number; professional: number } = { counts: {}, total: 0, professional: 0 }
) {
  queryParams$ = new BehaviorSubject(convertToParamMap(params));

  getAllSpy = jasmine
    .createSpy('getAll')
    .and.returnValue(of({ status: 'success', count: 0, pagination: null, data: { documents: [] } }));
  countsSpy = jasmine
    .createSpy('countsByAgeGroup')
    .and.returnValue(of({ status: 'success', data: countsResponse }));
  teamsGetAllSpy = jasmine
    .createSpy('getAll')
    .and.returnValue(of({ status: 'success', count: 0, pagination: null, data: { documents: [] } }));

  const playerServiceStub = {
    getAll: getAllSpy,
    countsByAgeGroup: countsSpy,
    delete: jasmine.createSpy('delete'),
  };
  const reportServiceStub = {
    getAverageRatings: () => of({ status: 'success', data: { averages: {} } }),
  };
  const teamServiceStub = {
    getAll: teamsGetAllSpy,
  };
  const authStub = {
    isAdmin: signal(role === 'admin'),
    isCoach: signal(role === 'coach'),
    isObserver: signal(role === 'observer'),
    // Stage 4 — the component now gates on this too; without it every test in this
    // file throws "auth.isProScout is not a function".
    isProScout: signal(role === 'proScout'),
    currentUser: signal({ _id: 'u1', role }),
  };

  await TestBed.configureTestingModule({
    imports: [PlayerListComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: PlayerService, useValue: playerServiceStub },
      { provide: ScoutingReportService, useValue: reportServiceStub },
      { provide: TeamService, useValue: teamServiceStub },
      { provide: AuthService, useValue: authStub },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(params), paramMap: convertToParamMap({}) },
          queryParamMap: queryParams$.asObservable(),
          paramMap: of(convertToParamMap({})),
        },
      },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');
  navigateSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  httpMock = TestBed.inject(HttpTestingController);

  fixture = TestBed.createComponent(PlayerListComponent);
  fixture.detectChanges();

  // loadGroups() fires GET /ages on init for every role except proScout (FR-002).
  // Flush it so the component reaches its settled state; assertions on whether the
  // call happened at all live in the proScout describe below.
  //
  // Must return at least one group: loadGroupCounts() early-returns on an empty list,
  // so flushing [] would make the age-group path look inert for every role and quietly
  // void the FR-014 regression assertions below.
  const ageReqs = httpMock.match(r => r.url.endsWith('/ages'));
  ageReqs.forEach(r =>
    r.flush({
      status: 'success',
      data: { documents: [{ _id: 'ag1', birthYear: 2012, name: 'U13' }] },
    })
  );

  compiled = fixture.nativeElement;
  return fixture.componentInstance;
}

const chip = () => compiled.querySelector('[data-testid="orphaned-filter"]');

describe('PlayerListComponent — orphaned players filter visibility', () => {
  it('is offered to an admin', async () => {
    await setup('admin');
    expect(chip()).toBeTruthy();
  });

  it('is hidden from a coach', async () => {
    await setup('coach');
    expect(chip()).toBeNull();
  });

  it('is hidden from an observer', async () => {
    // الأوبزيرفر مابيشوفش صف الـchips كله أصلاً
    await setup('observer');
    expect(chip()).toBeNull();
  });
});

describe('PlayerListComponent — orphaned players filter behaviour', () => {
  // specs/006-admin-professional-lens PC-1 — owner-directed change: both
  // chips now clear the whole view on toggle instead of merging, so they
  // behave symmetrically. Was `queryParamsHandling: 'merge'` and
  // `{ coach: null }` on switch-off; updated in place with this reason,
  // following the project's established precedent for updating pre-existing
  // assertions when a stage deliberately changes behavior.
  it('navigates with coach=none and no other params when switched on', async () => {
    const comp = await setup('admin');
    expect(comp.orphanedOnly()).toBeFalse();

    comp.toggleOrphaned();

    expect(navigateSpy).toHaveBeenCalled();
    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ coach: 'none' });
    expect(extras.queryParamsHandling).toBeUndefined();
  });

  it('clears every param (a full reset, not just coach) when switched off', async () => {
    const comp = await setup('admin', { coach: 'none' });
    expect(comp.orphanedOnly()).toBeTrue();

    comp.toggleOrphaned();

    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({});
  });

  it('clears the keyword on toggle (it lives outside the URL, so no navigation would clear it on its own)', async () => {
    const comp = await setup('admin');
    comp.keyword = 'mo salah';

    comp.toggleOrphaned();

    expect(comp.keyword).toBe('');
  });

  it('sends coach=none to the API when the param is active', async () => {
    await setup('admin', { coach: 'none' });

    const filters = getAllSpy.calls.mostRecent().args[0];
    expect(filters.coach).toBe('none');
  });

  it('with no lens the admin lands on the age-group picker, not a flat list', async () => {
    const comp = await setup('admin', {});
    expect(comp.orphanedOnly()).toBeFalse();
    expect(comp.flatView()).toBeFalse();
    // شاشة الفئات مابتحمّلش لاعبين — بتحمّل الأعداد بس
    expect(getAllSpy).not.toHaveBeenCalled();
  });

  it('shows a flat list instead of the age-group picker', async () => {
    // اليتامى ممتدين على كل الفئات، وendpoint الـcounts بيتجاهل coach=none
    // (مش ObjectId صالح) فشبكة الفئات كانت هتوري أعداد غلط
    const comp = await setup('admin', { coach: 'none' });
    expect(comp.flatView()).toBeTrue();
    expect(comp.selectedGroup()).toBeNull();
  });

  it('keeps an active status filter alongside the lens', async () => {
    const comp = await setup('admin', { coach: 'none', status: 'pending' });

    expect(comp.orphanedOnly()).toBeTrue();
    const filters = getAllSpy.calls.mostRecent().args[0];
    expect(filters.coach).toBe('none');
    expect(filters.status).toBe('pending');
  });

  it('a real coach id is not mistaken for the lens', async () => {
    const comp = await setup('admin', { coach: '507f1f77bcf86cd799439011' });

    expect(comp.orphanedOnly()).toBeFalse();
    // وبيفضل على تصفّح الفئات زي ما كان — الـflat view لليتامى بس
    expect(comp.flatView()).toBeFalse();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// specs/006-admin-professional-lens — Stage 4c. Gap-fix for a regression
// Stage 4b introduced (professional players carry no ageGroup, so they had
// no card and no intentional route on this page), not part of the original
// scout-pro plan. Mirrors the orphaned-filter test blocks above by design —
// same interaction pattern (US1 scenario 1), deliberately symmetric behavior
// with it (PC-1, tested above on the orphaned chip itself).
// ═══════════════════════════════════════════════════════════════════════════

const professionalChip = () => compiled.querySelector('[data-testid="professional-filter"]');
const teamDropdown = () => compiled.querySelector('[data-testid="professional-team-filter"]');

describe('PlayerListComponent — professional league filter visibility (FR-010)', () => {
  it('is offered to an admin', async () => {
    await setup('admin');
    expect(professionalChip()).toBeTruthy();
  });

  it('is hidden from a coach', async () => {
    await setup('coach');
    expect(professionalChip()).toBeNull();
  });

  it('is hidden from an observer', async () => {
    await setup('observer');
    expect(professionalChip()).toBeNull();
  });

  it('is hidden from a proScout — their entire scope is already professional', async () => {
    await setup('proScout');
    expect(professionalChip()).toBeNull();
  });
});

describe('PlayerListComponent — professional league filter behaviour (FR-013, FR-013a, PC-1)', () => {
  it('navigates with isProfessional=true and no other params when switched on', async () => {
    const comp = await setup('admin');
    expect(comp.professionalOnly()).toBeFalse();

    comp.toggleProfessional();

    expect(navigateSpy).toHaveBeenCalled();
    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ isProfessional: 'true' });
    expect(extras.queryParamsHandling).toBeUndefined();
  });

  it('clears every param when switched off', async () => {
    const comp = await setup('admin', { isProfessional: 'true' });
    expect(comp.professionalOnly()).toBeTrue();

    comp.toggleProfessional();

    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({});
  });

  it('clears the keyword on toggle', async () => {
    const comp = await setup('admin');
    comp.keyword = 'mo salah';

    comp.toggleProfessional();

    expect(comp.keyword).toBe('');
  });

  it('sends isProfessional=true to the API when the param is active', async () => {
    await setup('admin', { isProfessional: 'true' });

    const filters = getAllSpy.calls.mostRecent().args[0];
    expect(filters.isProfessional).toBe('true');
  });

  it('shows a flat list instead of the age-group picker', async () => {
    const comp = await setup('admin', { isProfessional: 'true' });
    expect(comp.flatView()).toBeTrue();
    expect(comp.selectedGroup()).toBeNull();
  });

  it('activating Professional League while No coach is active clears No coach (FR-013 scenario 4)', async () => {
    const comp = await setup('admin', { coach: 'none' });
    expect(comp.orphanedOnly()).toBeTrue();

    comp.toggleProfessional();

    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ isProfessional: 'true' });
  });

  it('activating No coach while Professional League is active clears Professional League (FR-013a scenario 5)', async () => {
    const comp = await setup('admin', { isProfessional: 'true' });
    expect(comp.professionalOnly()).toBeTrue();

    comp.toggleOrphaned();

    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ coach: 'none' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US2 — search/sort/pagination behave identically in this lens (FR-004)
// ═══════════════════════════════════════════════════════════════════════════
describe('PlayerListComponent — professional lens composes with search (US2, FR-004)', () => {
  it('typing a keyword while the lens is active still carries isProfessional=true', async () => {
    const comp = await setup('admin', { isProfessional: 'true' });
    comp.keyword = 'salah';

    comp.resetAndLoad();

    const filters = getAllSpy.calls.mostRecent().args[0];
    expect(filters.isProfessional).toBe('true');
    expect(filters.keyword).toBe('salah');
  });

  it('deactivating the lens with a keyword set does not leave a stale isProfessional param behind', async () => {
    const comp = await setup('admin', { isProfessional: 'true' });
    comp.keyword = 'salah';

    comp.toggleProfessional();

    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({});
    expect(comp.keyword).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US3 — the chip badge shows the professional count while the grid (not the
// flat view) is visible — the INVERSE of every other chip badge in this
// file, which shows its count only while its own chip is active. FR-011.
// ═══════════════════════════════════════════════════════════════════════════
describe('PlayerListComponent — professional count badge on the grid (US3, FR-011)', () => {
  it('shows the professional count on the chip while the grid is visible', async () => {
    await setup('admin', {}, { counts: { ag1: 3 }, total: 5, professional: 2 });
    fixture.detectChanges();

    const badge = professionalChip()?.querySelector('.chip-badge');
    expect(badge?.textContent?.trim()).toBe('2');
  });

  it('shows no badge when there are no professional players', async () => {
    await setup('admin', {}, { counts: { ag1: 5 }, total: 5, professional: 0 });
    fixture.detectChanges();

    expect(professionalChip()?.querySelector('.chip-badge')).toBeNull();
  });

  it('shows no badge while the chip itself is active (flat view) — inverted vs. every other chip badge', async () => {
    await setup('admin', { isProfessional: 'true' }, { counts: {}, total: 2, professional: 2 });
    fixture.detectChanges();

    expect(professionalChip()?.querySelector('.chip-badge')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PC-2 — team dropdown, scoped to the professional lens only (D-4)
// ═══════════════════════════════════════════════════════════════════════════
describe('PlayerListComponent — professional-only team dropdown (PC-2, FR-013b)', () => {
  it('is hidden outside the professional lens', async () => {
    await setup('admin');
    expect(teamDropdown()).toBeNull();
    expect(teamsGetAllSpy).not.toHaveBeenCalled();
  });

  it('is shown once the lens is active, populated from professional-league teams only', async () => {
    await setup('admin', { isProfessional: 'true' });

    expect(teamDropdown()).toBeTruthy();
    expect(teamsGetAllSpy).toHaveBeenCalledWith(undefined, 'professional');
  });

  it('is hidden for a coach even if they somehow reached a flat view', async () => {
    // The lens itself is admin-only (FR-010), so this dropdown — which only
    // ever renders inside it — is unreachable for every other role by
    // construction. Asserted directly rather than assumed.
    await setup('coach');
    expect(teamDropdown()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Stage 4 / US1 — the age-group dimension is removed for proScout only.
// FR-002, FR-014. See specs/005-proscout-players-write/.
// ═══════════════════════════════════════════════════════════════════════════

const ageGroupGrid = () => compiled.querySelector('.age-group-card');
const addButton = () => compiled.querySelector('a[routerLink="/players/new"]');

describe('PlayerListComponent — proScout has no age-group dimension (FR-002)', () => {
  it('lands on a flat player list, never the age-group picker', async () => {
    const comp = await setup('proScout');
    expect(comp.flatView()).toBeTrue();
    expect(comp.selectedGroup()).toBeNull();
    expect(getAllSpy).toHaveBeenCalled();
  });

  it('renders no age-group cards', async () => {
    await setup('proScout');
    expect(ageGroupGrid()).toBeNull();
  });

  it('issues NO request to /ages', async () => {
    // Backend audit fix S2 (constitution v1.3.0, C-3) closed
    // TODO(AGES_UNAUTHENTICATED_READ): GET /ages now denies proScout with 403.
    // This assertion still matters on its own terms — the component must not
    // even *attempt* the request for a role with no age-group dimension,
    // regardless of what the server would say back.
    await setup('proScout');
    httpMock.expectNone(r => r.url.endsWith('/ages'));
  });

  it('never loads per-group counts', async () => {
    await setup('proScout');
    expect(countsSpy).not.toHaveBeenCalled();
  });

  it('sends no ageGroup query param to the players API', async () => {
    // T019 — asserted on the actual request, not inferred from "both sources are empty".
    await setup('proScout');
    const filters = getAllSpy.calls.mostRecent().args[0];
    expect(filters.ageGroup).toBeUndefined();
  });

  it('ignores an ageGroup param smuggled into the URL', async () => {
    // A proScout hand-editing the URL must not be able to re-enter the grouped view.
    const comp = await setup('proScout', { ageGroup: '507f1f77bcf86cd799439099' });
    expect(comp.selectedGroup()).toBeNull();
    expect(ageGroupGrid()).toBeNull();
  });

  it('offers the Add player control (FR-007)', async () => {
    await setup('proScout');
    expect(addButton()).toBeTruthy();
  });
});

describe('PlayerListComponent — other roles keep the age-group UI (FR-014)', () => {
  it('a coach still sees the age-group picker and still fetches /ages', async () => {
    const comp = await setup('coach');
    expect(comp.flatView()).toBeFalse();
    expect(countsSpy).toHaveBeenCalled();
  });

  it('an admin still sees the age-group picker', async () => {
    const comp = await setup('admin');
    expect(comp.flatView()).toBeFalse();
    expect(countsSpy).toHaveBeenCalled();
  });

  it('an observer keeps its own flat list — unchanged by this stage', async () => {
    const comp = await setup('observer');
    expect(comp.flatView()).toBeTrue();
  });

  it('an observer does not get the Add player control', async () => {
    // The widened gate is proScout-specific; it must not leak to other roles.
    await setup('observer');
    expect(addButton()).toBeNull();
  });

  it('an admin does not get the Add player control', async () => {
    await setup('admin');
    expect(addButton()).toBeNull();
  });
});

// specs/010-professional-lens-creator — creatorName() mirrors coachName()'s
// three-way guard (populated object / bare string / absent) for the new
// admin-only createdBy field. T010, T019.
describe('PlayerListComponent — creatorName()', () => {
  it('returns the name when createdBy is a populated { _id, name } object (T010)', async () => {
    const comp = await setup('admin');
    const player = { createdBy: { _id: 'u9', name: 'Scout Alpha' } } as Player;
    expect(comp.creatorName(player)).toBe('Scout Alpha');
  });

  it('returns an empty string when createdBy is a bare id string (T019)', async () => {
    const comp = await setup('admin');
    const player = { createdBy: '507f1f77bcf86cd799439099' } as Player;
    expect(comp.creatorName(player)).toBe('');
  });

  it('returns an empty string when createdBy is null (T019)', async () => {
    const comp = await setup('admin');
    const player = { createdBy: null } as unknown as Player;
    expect(comp.creatorName(player)).toBe('');
  });

  it('returns an empty string when createdBy is absent (T019)', async () => {
    const comp = await setup('admin');
    const player = {} as Player;
    expect(comp.creatorName(player)).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// audit-frontend P6 — البحث: التأخير وحماية السباق.
//
// الحالة قبل الإصلاح، مقيسة على بناء إنتاج حقيقي بمتصفح حقيقي: كتابة 6 حروف =
// **12 ريكوست** (اتنين لكل ضغطة زرار: /players وبعده /players/reports/
// average-ratings)، بصفر تباين في 5 تشغيلات متتالية.
//
// والأخطر إن مكانش فيه إلغاء: كل نداء كان بيفتح اشتراك مستقل، والمعروض في الآخر
// هو **آخر رد بيوصل** مش آخر بحث. التست التاني تحت بيثبّت ده تحديدًا — وهو
// بيفشل على الكود القديم حتى لو التأخير اتضاف من غير switchMap.
// ══════════════════════════════════════════════════════════════════════════════
describe('PlayerListComponent — search debounce and race protection (P6)', () => {
  it('collapses a burst of keystrokes into a single request', fakeAsync(async () => {
    const comp = await setup('admin');
    getAllSpy.calls.reset();

    for (const value of ['p', 'pl', 'pla', 'play', 'playe', 'player']) {
      comp.keyword = value;
      comp.onKeywordChange(value);
      tick(120); // نفس إيقاع الكتابة الطبيعي — أقصر من نافذة التأخير
    }
    // لسه مفيش طلب: آخر ضغطة لسه جوه النافذة
    expect(getAllSpy).not.toHaveBeenCalled();

    tick(300);
    expect(getAllSpy).toHaveBeenCalledTimes(1);
    expect(getAllSpy.calls.mostRecent().args[0].keyword).toBe('player');

    flush();
  }));

  it('shows the newest search even when an older response arrives after it', fakeAsync(async () => {
    const comp = await setup('admin');
    getAllSpy.calls.reset();

    const playersFor = (name: string) =>
      ({ status: 'success', count: 1, pagination: null,
         data: { documents: [{ _id: name, name } as unknown as Player] } });

    // "moh" بيرد بعد 500ms، و"mohamed" بعد 100ms — يعني القديم بيوصل **بعد**
    // الجديد، وهو بالظبط اللي بيحصل على شبكة بترجّع الردود بترتيب مختلط.
    const slow = new Subject<any>();
    const fast = new Subject<any>();
    getAllSpy.and.returnValues(slow.asObservable(), fast.asObservable());

    comp.keyword = 'moh';
    comp.onKeywordChange('moh');
    tick(300);
    expect(getAllSpy).toHaveBeenCalledTimes(1);

    comp.keyword = 'mohamed';
    comp.onKeywordChange('mohamed');
    tick(300);
    expect(getAllSpy).toHaveBeenCalledTimes(2);

    // الرد الجديد الأول
    fast.next(playersFor('mohamed'));
    fast.complete();
    // وبعدين الرد القديم — switchMap اللي بيلغي الاشتراك القديم هو اللي بيمنعه
    // إنه يكتب فوق الجديد. من غيره الشاشة بتقع على "moh".
    slow.next(playersFor('moh'));
    slow.complete();

    expect(comp.players().map(p => p.name)).toEqual(['mohamed']);

    flush();
  }));

  it('clearing the box searches once, with an empty keyword', fakeAsync(async () => {
    const comp = await setup('admin');
    comp.keyword = 'player';
    comp.onKeywordChange('player');
    tick(300);
    getAllSpy.calls.reset();

    comp.clearKeyword();
    expect(comp.keyword).toBe('');
    tick(300);

    expect(getAllSpy).toHaveBeenCalledTimes(1);
    expect(getAllSpy.calls.mostRecent().args[0].keyword).toBeUndefined();

    flush();
  }));

  it('a filter change is not delayed — only typing is', fakeAsync(async () => {
    const comp = await setup('admin');
    getAllSpy.calls.reset();

    comp.positionFilter = 'CM';
    comp.resetAndLoad();

    expect(getAllSpy).toHaveBeenCalledTimes(1);
    expect(getAllSpy.calls.mostRecent().args[0].position).toBe('CM');

    flush();
  }));
});
