import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { ReportFormComponent } from './report-form.component';
import { ScoutingReportService } from '../services/scouting-report.service';
import { PlayerService } from '../../players/services/player.service';
import { SeasonMatchService } from '../../season-matches/services/season-match.service';
import { TeamService } from '../../teams/services/team.service';
import { ToastService } from '../../../core/services/toast.service';

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

const PRO_TEAM = { _id: 'proteam1', name: 'Pro Home Club' };
const YOUTH_TEAM = { _id: 'youthteam1', name: 'Youth Club' };

function makeMatch(id: string, home: any, away: any) {
  return {
    _id: id, season: '2026/2027', league: 'professional',
    homeTeam: home, awayTeam: away, matchDate: new Date().toISOString(),
    status: 'scheduled', attendees: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function setup(player: any, todaysMatches: any[] = [], teams: any[] = []) {
  teamsGetAllSpy = jasmine.createSpy('teams.getAll').and.returnValue(
    of({ status: 'success', count: teams.length, pagination: null, data: { documents: teams } })
  );
  matchesGetAllSpy = jasmine.createSpy('matches.getAll').and.returnValue(
    of({ status: 'success', count: todaysMatches.length, pagination: null, data: { documents: todaysMatches } })
  );

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
        useValue: { getOne: jasmine.createSpy('getOne'), create: jasmine.createSpy('create'), update: jasmine.createSpy('update') },
      },
      { provide: ToastService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy() } },
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

describe('ReportFormComponent — youth players keep the age-group scope unchanged', () => {
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
