import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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

async function setup(role: 'admin' | 'coach' | 'observer' = 'admin', params: Record<string, string> = {}) {
  queryParams$ = new BehaviorSubject(convertToParamMap(params));

  getAllSpy = jasmine
    .createSpy('getAll')
    .and.returnValue(of({ status: 'success', count: 0, pagination: null, data: { documents: [] } }));

  const playerServiceStub = {
    getAll: getAllSpy,
    countsByAgeGroup: () => of({ status: 'success', data: { counts: {}, total: 0 } }),
    delete: jasmine.createSpy('delete'),
  };
  const reportServiceStub = {
    getAverageRatings: () => of({ status: 'success', data: { averages: {} } }),
  };
  const authStub = {
    isAdmin: signal(role === 'admin'),
    isCoach: signal(role === 'coach'),
    isObserver: signal(role === 'observer'),
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

  fixture = TestBed.createComponent(PlayerListComponent);
  fixture.detectChanges();
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
