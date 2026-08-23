import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { ProScoutDashboardComponent } from './pro-scout-dashboard.component';
import { DashboardService } from '../services/dashboard.service';
import { ProScoutDashboard } from '../../../core/models/dashboard.model';
import { ApiResponse } from '../../../core/models/api-response.model';

const EMPTY_DATA: ProScoutDashboard = {
  totalPlayers: 0,
  selectedPlayers: 0,
  pendingPlayers: 0,
  rejectedPlayers: 0,
  upcomingMatchesCount: 0,
  totalReports: 0,
  upcomingMatches: [],
  latestResults: [],
  recentReports: [],
};

const FILLED_DATA: ProScoutDashboard = {
  totalPlayers: 4,
  selectedPlayers: 2,
  pendingPlayers: 1,
  rejectedPlayers: 1,
  upcomingMatchesCount: 2,
  totalReports: 3,
  upcomingMatches: [
    {
      _id: 'm1',
      matchDate: '2026-09-04T00:00:00.000Z',
      homeTeam: { _id: 't1', name: 'Al Ahly A', clubName: 'Al Ahly' },
      awayTeam: { _id: 't2', name: 'Zamalek A', clubName: 'Zamalek' },
      venue: null,
      status: 'scheduled',
      result: null,
    },
  ],
  latestResults: [
    {
      _id: 'm2',
      matchDate: '2026-08-10T00:00:00.000Z',
      homeTeam: { _id: 't1', name: 'Al Ahly A', clubName: 'Al Ahly' },
      awayTeam: { _id: 't3', name: 'Pyramids A', clubName: 'Pyramids' },
      venue: 'Cairo Stadium',
      status: 'completed',
      result: { homeScore: 2, awayScore: 1 },
    },
  ],
  recentReports: [
    {
      _id: 'r1',
      player: { _id: 'p1', name: 'Ahmed Ali', position: 'CM' },
      matchDate: '2026-08-10T00:00:00.000Z',
      overallRating: 7.4,
    },
  ],
};

let fixture: ComponentFixture<ProScoutDashboardComponent>;
let getProScoutDashboardSpy: jasmine.Spy;

async function setup(data: ProScoutDashboard) {
  getProScoutDashboardSpy = jasmine.createSpy('getProScoutDashboard')
    .and.returnValue(of({ status: 'success', data } as ApiResponse<ProScoutDashboard>));

  const dashboardServiceStub = { getProScoutDashboard: getProScoutDashboardSpy };

  await TestBed.configureTestingModule({
    imports: [ProScoutDashboardComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: DashboardService, useValue: dashboardServiceStub },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');

  fixture = TestBed.createComponent(ProScoutDashboardComponent);
  fixture.detectChanges();
}

describe('ProScoutDashboardComponent', () => {
  it('calls getProScoutDashboard() on init', async () => {
    await setup(EMPTY_DATA);
    expect(getProScoutDashboardSpy).toHaveBeenCalledTimes(1);
  });

  it('renders the returned figures', async () => {
    await setup(FILLED_DATA);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('4');   // totalPlayers
    expect(text).toContain('2');   // upcomingMatchesCount
    expect(text).toContain('3');   // totalReports
    expect(text).toContain('Al Ahly A');
    expect(text).toContain('Ahmed Ali');
  });

  it('renders the Selected/Pending/Rejected status cards with the correct values and labels (Stage 12)', async () => {
    await setup(FILLED_DATA);
    const cards = Array.from(fixture.nativeElement.querySelectorAll('app-stat-card')) as HTMLElement[];
    const valueFor = (labelKey: string) => {
      const card = cards.find(c => c.textContent?.includes(labelKey));
      return card?.querySelector('.text-3xl')?.textContent?.trim();
    };
    expect(valueFor('DASHBOARD.SELECTED')).toBe('2');
    expect(valueFor('DASHBOARD.PENDING')).toBe('1');
    expect(valueFor('DASHBOARD.REJECTED')).toBe('1');
  });

  it('shows the empty-state message in each list section when all three arrays are empty (FR-006, SC-003)', async () => {
    await setup(EMPTY_DATA);
    // TranslatePipe has no HTTP loader in this harness, so it renders the raw
    // key — the same reason sidebar.component.spec.ts asserts on hrefs rather
    // than translated text. Asserting on the key still proves the right
    // empty-state branch rendered instead of the populated list.
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('DASHBOARD.NO_UPCOMING_MATCHES');
    expect(text).toContain('DASHBOARD.NO_RESULTS_YET');
    expect(text).toContain('DASHBOARD.NO_REPORTS_YET');
  });

  it('renders the stat cards as 0 (not blank) when there is no data', async () => {
    await setup(EMPTY_DATA);
    const statValues = Array.from(
      fixture.nativeElement.querySelectorAll('.tabular-nums')
    ) as HTMLElement[];
    const hasZero = statValues.some(el => el.textContent?.trim() === '0');
    expect(hasZero).toBeTrue();
  });

  it('does not mention any age group anywhere on the page (FR-005)', async () => {
    await setup(FILLED_DATA);
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('age group');
    expect(text).not.toContain('ageGroup'.toLowerCase());
  });
});
