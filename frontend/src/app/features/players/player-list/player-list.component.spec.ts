import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';

import { PlayerListComponent } from './player-list.component';
import { PlayerService } from '../services/player.service';
import { ScoutingReportService } from '../../scouting-reports/services/scouting-report.service';
import { AuthService } from '../../../core/auth/auth.service';

// §9 — عدسة "اللاعبين اليتامى" في قايمة اللاعبين. أدمن-فقط، وبتبعت ?coach=none
// اللي الباكإند بيترجمه لـ{coach: null} (شوف PLAYER_ADMIN_ONLY_LENSES).

let fixture: ComponentFixture<PlayerListComponent>;
let compiled: HTMLElement;
let getAllSpy: jasmine.Spy;
let navigateSpy: jasmine.Spy;
let queryParams$: BehaviorSubject<any>;

type TestRole = 'admin' | 'coach' | 'observer' | 'proScout';

let countsSpy: jasmine.Spy;
let httpMock: HttpTestingController;

async function setup(role: TestRole = 'admin', params: Record<string, string> = {}) {
  queryParams$ = new BehaviorSubject(convertToParamMap(params));

  getAllSpy = jasmine
    .createSpy('getAll')
    .and.returnValue(of({ status: 'success', count: 0, pagination: null, data: { documents: [] } }));
  countsSpy = jasmine
    .createSpy('countsByAgeGroup')
    .and.returnValue(of({ status: 'success', data: { counts: {}, total: 0 } }));

  const playerServiceStub = {
    getAll: getAllSpy,
    countsByAgeGroup: countsSpy,
    delete: jasmine.createSpy('delete'),
  };
  const reportServiceStub = {
    getAverageRatings: () => of({ status: 'success', data: { averages: {} } }),
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
  it('navigates with coach=none when switched on', async () => {
    const comp = await setup('admin');
    expect(comp.orphanedOnly()).toBeFalse();

    comp.toggleOrphaned();

    expect(navigateSpy).toHaveBeenCalled();
    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ coach: 'none' });
    expect(extras.queryParamsHandling).toBe('merge');
  });

  it('clears the param when switched off', async () => {
    const comp = await setup('admin', { coach: 'none' });
    expect(comp.orphanedOnly()).toBeTrue();

    comp.toggleOrphaned();

    const [, extras] = navigateSpy.calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ coach: null });
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
    // Principle I — this is an intent fix, not a lock. GET /ages has no `protect`
    // and answers 200 to anyone (C-3, still open). The assertion is that the role
    // does not *consume* the category, not that the endpoint refuses it.
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
