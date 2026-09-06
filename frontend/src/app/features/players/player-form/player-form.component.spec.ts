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
import { UserService } from '../../users/services/user.service';
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
let createSpy: jasmine.Spy;
let usersGetAllSpy: jasmine.Spy;

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
  createSpy = jasmine.createSpy('create').and.returnValue(
    of({ status: 'success', data: { document: { _id: 'new1' } } })
  );
  usersGetAllSpy = jasmine.createSpy('getAll').and.returnValue(
    of({ status: 'success', count: 2, data: { documents: [{ _id: 'x1', name: 'Alpha' }, { _id: 'x2', name: 'Beta' }] } })
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
      { provide: PlayerService, useValue: { getOne: getOneSpy, create: createSpy, update: jasmine.createSpy('update') } },
      { provide: TeamService, useValue: { getAll: teamsGetAllSpy } },
      { provide: UserService, useValue: { getAll: usersGetAllSpy } },
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

// admin-assign-players-reports-media — the admin-only "assign to" block, create-only.
describe('PlayerFormComponent — admin "assign to" block (admin-assign-players-reports-media)', () => {
  const assignToText = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('is offered to an admin on create', async () => {
    await setup('admin');
    expect(assignToText()).toContain('PLAYERS.FORM.ASSIGN_TO');
  });

  it('is not offered to a coach', async () => {
    await setup('coach');
    expect(assignToText()).not.toContain('PLAYERS.FORM.ASSIGN_TO');
  });

  it('is not offered to an admin editing an existing player (reassignment lives on player-detail)', async () => {
    await setup('admin', { playerId: 'p1', player: { _id: 'p1', name: 'X', dateOfBirth: '2012-01-01' } });
    expect(assignToText()).not.toContain('PLAYERS.FORM.ASSIGN_TO');
  });

  it('loads the coach list only once the coach tab is first selected', async () => {
    const comp = await setup('admin');
    expect(usersGetAllSpy).not.toHaveBeenCalled();

    comp.selectAssignRole('coach');
    expect(usersGetAllSpy).toHaveBeenCalledWith({ role: 'coach', sort: 'name' });
    expect(comp.assignCoachOptions().length).toBe(2);

    comp.selectAssignRole('coach');
    expect(usersGetAllSpy).toHaveBeenCalledTimes(1); // not reloaded on re-select
  });

  it('loads observers and proScouts on their own tabs, independently', async () => {
    const comp = await setup('admin');

    comp.selectAssignRole('observer');
    expect(usersGetAllSpy).toHaveBeenCalledWith({ role: 'observer', sort: 'name' });
    expect(comp.assignObserverOptions().length).toBe(2);

    comp.selectAssignRole('proScout');
    expect(usersGetAllSpy).toHaveBeenCalledWith({ role: 'proScout', sort: 'name' });
    expect(comp.assignProScoutOptions().length).toBe(2);
  });

  it('sends coach on submit only when the coach tab is selected and a value is chosen', async () => {
    const comp = await setup('admin');
    comp.form.patchValue({
      name: 'Ahmed Ali', dateOfBirth: '2012-01-01', position: 'CM', preferredFoot: 'right',
      nationality: 'Egyptian', city: 'Cairo', address: '1 Test St', phoneNumber: '01012345678',
    });
    comp.selectAssignRole('coach');
    comp.assignCoachId.set('x1');

    comp.submit();

    expect(createSpy).toHaveBeenCalled();
    const payload = createSpy.calls.mostRecent().args[0];
    expect(payload.coach).toBe('x1');
    expect(payload.observers).toBeUndefined();
    expect(payload.proScout).toBeUndefined();
  });

  it('sends observers as an array on submit when the observer tab is selected', async () => {
    const comp = await setup('admin');
    comp.form.patchValue({
      name: 'Ahmed Ali', dateOfBirth: '2012-01-01', position: 'CM', preferredFoot: 'right',
      nationality: 'Egyptian', city: 'Cairo', address: '1 Test St', phoneNumber: '01012345678',
    });
    comp.selectAssignRole('observer');
    comp.toggleAssignObserver('x1');
    comp.toggleAssignObserver('x2');

    comp.submit();

    const payload = createSpy.calls.mostRecent().args[0];
    expect(payload.observers).toEqual(jasmine.arrayContaining(['x1', 'x2']));
    expect(payload.coach).toBeUndefined();
  });

  it('sends nothing extra when no assignment tab was chosen ("None")', async () => {
    const comp = await setup('admin');
    comp.form.patchValue({
      name: 'Ahmed Ali', dateOfBirth: '2012-01-01', position: 'CM', preferredFoot: 'right',
      nationality: 'Egyptian', city: 'Cairo', address: '1 Test St', phoneNumber: '01012345678',
    });

    comp.submit();

    const payload = createSpy.calls.mostRecent().args[0];
    expect(payload.coach).toBeUndefined();
    expect(payload.observers).toBeUndefined();
    expect(payload.proScout).toBeUndefined();
  });

  it('a non-admin submit never carries assignment fields, regardless of any stray local state', async () => {
    const comp = await setup('coach');
    comp.form.patchValue({
      name: 'Ahmed Ali', dateOfBirth: '2012-01-01', position: 'CM', preferredFoot: 'right',
      nationality: 'Egyptian', city: 'Cairo', address: '1 Test St', phoneNumber: '01012345678',
    });
    // simulate stray state — should never happen from the template (block isn't rendered
    // for a coach) but confirms submit() itself gates on auth.isAdmin(), not just the UI
    (comp as any).assignRole.set('coach');
    (comp as any).assignCoachId.set('x1');

    comp.submit();

    const payload = createSpy.calls.mostRecent().args[0];
    expect(payload.coach).toBeUndefined();
  });
});
