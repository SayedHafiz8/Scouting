import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { ReportListComponent } from './report-list.component';
import { ScoutingReportService } from '../services/scouting-report.service';
import { AuthService } from '../../../core/auth/auth.service';
import { User, UserRole } from '../../../core/models/user.model';

// The server has allowed a proScout to create and edit its own reports since the
// role was introduced (POST/PATCH /players/:playerId/reports carry ROLES.PRO_SCOUT,
// and checkReportOwnership narrows the edit to reports it authored on players in
// its own scope). The UI never offered it: every entry point tested "coach or
// observer", so a proScout landed on the reports tab with no way in at all.

let fixture: ComponentFixture<ReportListComponent>;

function makeUser(role: UserRole): User {
  return {
    _id: 'u1', name: 'Test User', email: 't@t.com', role, active: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeReport(id = 'r1') {
  return {
    _id: id, player: 'p1', coach: { _id: 'u1', name: 'Test User' },
    overallRating: 7, matchDate: '2026-09-01T00:00:00.000Z',
    technical: {}, physical: {}, mental: {},
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

async function setup(role: UserRole, reports: any[] = []) {
  const authStub = {
    currentUser: signal<User | null>(makeUser(role)),
    isAdmin: signal(role === 'admin'),
    isCoach: signal(role === 'coach'),
    isObserver: signal(role === 'observer'),
    isProScout: signal(role === 'proScout'),
  };

  await TestBed.configureTestingModule({
    imports: [ReportListComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: AuthService, useValue: authStub },
      {
        provide: ScoutingReportService,
        useValue: {
          getAll: jasmine.createSpy('getAll').and.returnValue(
            of({ status: 'success', count: reports.length, pagination: null, data: { documents: reports } })
          ),
          delete: jasmine.createSpy('delete'),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ playerId: 'p1' }),
            queryParamMap: convertToParamMap({}),
            pathFromRoot: [{ paramMap: convertToParamMap({ playerId: 'p1' }) }],
          },
          parent: { snapshot: { paramMap: convertToParamMap({ playerId: 'p1' }) } },
        },
      },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');
  fixture = TestBed.createComponent(ReportListComponent);
  fixture.detectChanges();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const addButton = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('a, button')).find(n => n.textContent?.includes('REPORTS.ADD')) ?? null;

const editLink = (el: HTMLElement) => el.querySelector('a[title="Edit"]');

describe('ReportListComponent — a proScout can reach the report form', () => {
  it('shows the "add report" action when the player already has reports', async () => {
    const el = await setup('proScout', [makeReport()]);
    expect(addButton(el)).toBeTruthy();
  });

  it('offers the "add report" action from the empty state too', async () => {
    const el = await setup('proScout', []);
    // ده بالظبط اللي كان ناقص: الحالة الفاضية بتقول "أنشئ أول تقرير" من غير أي زرار
    expect(el.textContent).toContain('REPORTS.EMPTY_TITLE');
    expect(addButton(el)).toBeTruthy();
  });

  it('offers an edit action on an existing report', async () => {
    const el = await setup('proScout', [makeReport()]);
    expect(editLink(el)).toBeTruthy();
  });
});

describe('ReportListComponent — the roles that already worked are unchanged', () => {
  it('coach still gets the add action', async () => {
    const el = await setup('coach', [makeReport()]);
    expect(addButton(el)).toBeTruthy();
  });

  it('observer still gets the add action', async () => {
    const el = await setup('observer', [makeReport()]);
    expect(addButton(el)).toBeTruthy();
  });

  it('⚠️ admin still gets no add action — reports are written by scouts, not admins', async () => {
    const el = await setup('admin', [makeReport()]);
    expect(addButton(el)).toBeNull();
  });

  it('⚠️ admin still gets no edit action', async () => {
    const el = await setup('admin', [makeReport()]);
    expect(editLink(el)).toBeNull();
  });
});
