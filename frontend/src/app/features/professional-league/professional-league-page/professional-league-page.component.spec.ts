import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { ProfessionalLeaguePageComponent } from './professional-league-page.component';
import { UserService } from '../../users/services/user.service';
import { TeamService } from '../../teams/services/team.service';
import { SeasonMatchService } from '../../season-matches/services/season-match.service';
import { ToastService } from '../../../core/services/toast.service';

describe('ProfessionalLeaguePageComponent', () => {
  let fixture: ComponentFixture<ProfessionalLeaguePageComponent>;
  let component: ProfessionalLeaguePageComponent;
  let userService: jasmine.SpyObj<UserService>;
  let teamService: jasmine.SpyObj<TeamService>;
  let seasonMatchService: jasmine.SpyObj<SeasonMatchService>;

  // `configure` runs after the spies exist but before the component is created —
  // so a test can override a return value that ngOnInit's initial load depends on.
  async function setup(configure?: () => void) {
    userService = jasmine.createSpyObj('UserService', ['getAll']);
    teamService = jasmine.createSpyObj('TeamService', ['getAll', 'create', 'delete']);
    seasonMatchService = jasmine.createSpyObj('SeasonMatchService', ['getAll', 'create', 'update', 'delete', 'updateStatus']);

    userService.getAll.and.returnValue(of({ status: 'success', count: 0, data: { documents: [] } } as any));
    teamService.getAll.and.returnValue(of({ status: 'success', count: 0, data: { documents: [] } } as any));
    seasonMatchService.getAll.and.returnValue(of({ status: 'success', count: 0, data: { documents: [] } } as any));

    configure?.();

    await TestBed.configureTestingModule({
      imports: [ProfessionalLeaguePageComponent],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UserService, useValue: userService },
        { provide: TeamService, useValue: teamService },
        { provide: SeasonMatchService, useValue: seasonMatchService },
        { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfessionalLeaguePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('lists fetched proScouts (US1)', async () => {
    await setup(() => {
      userService.getAll.and.returnValue(of({
        status: 'success', count: 1,
        data: { documents: [{ _id: 'p1', name: 'Scout One', email: 's1@test.com', role: 'proScout', active: true }] },
      } as any));
    });
    expect(userService.getAll).toHaveBeenCalledWith(jasmine.objectContaining({ role: 'proScout' }));
    expect(component.proScouts().length).toBe(1);
  });

  it('shows the proScouts empty state when the list is empty', async () => {
    await setup();
    const empty = fixture.nativeElement.querySelector('app-empty-state');
    expect(empty).toBeTruthy();
  });

  it('creating a professional team sends no ageGroup and only lists professional-league teams', async () => {
    await setup(() => {
      teamService.getAll.and.returnValue(of({
        status: 'success', count: 1,
        data: { documents: [{ _id: 't1', name: 'team a', clubName: 'Club A', league: 'professional', active: true }] },
      } as any));
      teamService.create.and.returnValue(of({ status: 'success', data: { document: {} } } as any));
    });

    expect(teamService.getAll).toHaveBeenCalledWith(undefined, 'professional');
    expect(component.teams().length).toBe(1);

    component.newTeamName = 'New Team';
    component.newTeamClubName = 'New Club';
    component.createTeam();

    const payload = teamService.create.calls.mostRecent().args[0];
    expect(payload.league).toBe('professional');
    expect((payload as any).ageGroup).toBeUndefined();
  });

  it('deleting a team removes it via TeamService and reloads the list', async () => {
    await setup(() => {
      teamService.delete.and.returnValue(of(undefined as any));
    });
    component.teamDeleteTarget.set({ _id: 't1', name: 'x', clubName: 'y', league: 'professional', active: true } as any);
    component.doDeleteTeam();
    expect(teamService.delete).toHaveBeenCalledWith('t1');
    expect(teamService.getAll).toHaveBeenCalledTimes(2);
  });

  it('creating a fixture sends no ageGroup and only lists professional-league matches', async () => {
    await setup(() => {
      seasonMatchService.create.and.returnValue(of({ status: 'success', data: { document: {} } } as any));
    });
    expect(seasonMatchService.getAll).toHaveBeenCalledWith(jasmine.objectContaining({ league: 'professional' }));

    component.matchForm = { _id: null, season: '2025/2026', matchDate: '2026-09-10', homeTeam: 'h1', awayTeam: 'a1', venue: '' };
    component.saveMatch();

    const payload = seasonMatchService.create.calls.mostRecent().args[0];
    expect(payload.league).toBe('professional');
    expect((payload as any).ageGroup).toBeUndefined();
  });
});
