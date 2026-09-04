import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { PlayerFormComponent } from './player-form.component';
import { PlayerService } from '../services/player.service';
import { TeamService } from '../../teams/services/team.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { LanguageService } from '../../../core/services/language.service';
import { User, UserRole } from '../../../core/models/user.model';
import { PaginatedResponse } from '../../../core/models/api-response.model';

// observer-matches-and-players — this component had no baseline spec before this
// stage. professionalContext() generalizes every former auth.isProScout() branch:
// proScout is always professional by role; an observer is professional only in the
// professional entry context (create: ?context=professional query param, known
// synchronously; edit: derived from the loaded player's own isProfessional, since
// there is no query param on edit and the flag is locked post-creation anyway).

let fixture: ComponentFixture<PlayerFormComponent>;
let teamsGetAllSpy: jasmine.Spy;
let getOneSpy: jasmine.Spy;

function makeUser(role: UserRole): User {
  return {
    _id: 'u1', name: 'Test User', email: 't@t.com', role, active: true,
    createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

async function setup(role: UserRole, opts: { playerId?: string; context?: string; player?: any } = {}) {
  teamsGetAllSpy = jasmine.createSpy('getAll').and.returnValue(
    of({ status: 'success', count: 0, pagination: null, data: { documents: [] } })
  );
  // ngOnInit calls getOne() synchronously (inside fixture.detectChanges() below)
  // when editing, so the response must be wired in before that call happens —
  // passed in via opts.player, not reassigned on the spy after setup() returns.
  getOneSpy = jasmine.createSpy('getOne').and.returnValue(
    of({ status: 'success', data: { document: opts.player ?? null } })
  );

  const authStub = {
    currentUser: signal<User | null>(makeUser(role)),
    isAdmin: signal(role === 'admin'),
    isCoach: signal(role === 'coach'),
    isObserver: signal(role === 'observer'),
    isProScout: signal(role === 'proScout'),
  };

  const queryParams: Record<string, string> = {};
  if (opts.context) queryParams['context'] = opts.context;
  const paramMap: Record<string, string> = {};
  if (opts.playerId) paramMap['playerId'] = opts.playerId;

  await TestBed.configureTestingModule({
    imports: [PlayerFormComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: AuthService, useValue: authStub },
      { provide: PlayerService, useValue: { getOne: getOneSpy, create: jasmine.createSpy('create'), update: jasmine.createSpy('update') } },
      { provide: TeamService, useValue: { getAll: teamsGetAllSpy } },
      { provide: ToastService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), warning: jasmine.createSpy() } },
      { provide: LanguageService, useValue: { current: () => 'en' } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(paramMap),
            queryParamMap: convertToParamMap(queryParams),
          },
        },
      },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');

  fixture = TestBed.createComponent(PlayerFormComponent);
  fixture.detectChanges();

  // Non-professional-context roles fetch /ages via HttpClient — this component
  // injects HttpClient directly (not a testable stub), so provideHttpClient +
  // HttpTestingController would be needed to flush it. Every assertion below
  // reads professionalContext()/dobYears/teamPickerUnlocked(), none of which
  // depend on that fetch resolving — so it's deliberately left unflushed rather
  // than pulling in HttpTestingController for no assertion that needs it.

  return fixture.componentInstance;
}

describe('PlayerFormComponent — professionalContext() (observer-matches-and-players)', () => {
  it('is true for proScout regardless of any query param', async () => {
    const comp = await setup('proScout');
    expect((comp as any).professionalContext()).toBeTrue();
  });

  it('is false for a coach', async () => {
    const comp = await setup('coach');
    expect((comp as any).professionalContext()).toBeFalse();
  });

  it('is false for an admin', async () => {
    const comp = await setup('admin');
    expect((comp as any).professionalContext()).toBeFalse();
  });

  it('is false for an observer creating with no context param (age-group-card entry)', async () => {
    const comp = await setup('observer');
    expect((comp as any).professionalContext()).toBeFalse();
  });

  it('is true for an observer creating with ?context=professional (professional-card entry)', async () => {
    const comp = await setup('observer', { context: 'professional' });
    expect((comp as any).professionalContext()).toBeTrue();
  });

  it('ignores an unrecognized context value — defaults to youth', async () => {
    const comp = await setup('observer', { context: 'something-else' });
    expect((comp as any).professionalContext()).toBeFalse();
  });
});

describe('PlayerFormComponent — professionalContext() drives the form, same as it did for proScout alone', () => {
  it('widens the birth-year floor to 1996 for an observer in the professional context', async () => {
    const comp = await setup('observer', { context: 'professional' });
    expect(Math.min(...comp.dobYears)).toBe(1996);
  });

  it('keeps the youth floor at 2007 for an observer with no context', async () => {
    const comp = await setup('observer');
    expect(Math.min(...comp.dobYears)).toBe(2007);
  });

  it('unlocks the team picker unconditionally for an observer in the professional context', async () => {
    const comp = await setup('observer', { context: 'professional' });
    expect(comp.teamPickerUnlocked()).toBeTrue();
  });

  it('gates the team picker on a resolved age group for an observer with no context', async () => {
    const comp = await setup('observer');
    expect(comp.teamPickerUnlocked()).toBeFalse();
  });

  it('requests the professional team list for an observer in the professional context', async () => {
    await setup('observer', { context: 'professional' });
    const call = teamsGetAllSpy.calls.mostRecent();
    expect(call.args).toEqual([undefined, 'professional']);
  });
});

describe('PlayerFormComponent — edit mode resolves entryContext from the loaded player (observer-matches-and-players)', () => {
  it('an observer editing a professional player gets the professional context, not the query param (there is none)', async () => {
    const comp = await setup('observer', {
      playerId: 'p1',
      player: { _id: 'p1', name: 'X', dateOfBirth: '2000-01-01', isProfessional: true },
    });

    expect((comp as any).professionalContext()).toBeTrue();
    // the professional team list was requested, never the /ages-gated youth path
    expect(teamsGetAllSpy).toHaveBeenCalledWith(undefined, 'professional');
  });

  it('an observer editing a youth player gets the youth context', async () => {
    const comp = await setup('observer', {
      playerId: 'p2',
      player: { _id: 'p2', name: 'Y', dateOfBirth: '2012-01-01', isProfessional: false },
    });

    expect((comp as any).professionalContext()).toBeFalse();
  });

  it('a proScout editing stays professional regardless of the loaded player (unaffected regression)', async () => {
    const comp = await setup('proScout', {
      playerId: 'p3',
      player: { _id: 'p3', name: 'Z', dateOfBirth: '2000-01-01', isProfessional: true },
    });

    expect((comp as any).professionalContext()).toBeTrue();
  });
});
