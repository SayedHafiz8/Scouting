import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';

import { SidebarComponent } from './sidebar.component';
import { AuthService } from '../../core/auth/auth.service';
import { User, UserRole } from '../../core/models/user.model';

// This spec is written BEFORE sidebar.component.ts is refactored and MUST pass
// against the unmodified component first (research.md R5). It captures the menu
// each existing role sees today so the "identical menu" claim (Constitution
// Principle III) is a measurement, not a restatement of intent.

let fixture: ComponentFixture<SidebarComponent>;

function makeUser(role: UserRole): User {
  return {
    _id: 'u1',
    name: 'Test User',
    email: 't@t.com',
    role,
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

async function setup(role: UserRole | null) {
  // Derived consistently from one `role` argument — a stub that disagreed with
  // itself (e.g. isCoach() true while currentUser().role is 'admin') would
  // measure a state that cannot occur in production.
  const authStub = {
    currentUser: signal<User | null>(role ? makeUser(role) : null),
    isAdmin: signal(role === 'admin'),
    isCoach: signal(role === 'coach'),
    isObserver: signal(role === 'observer'),
  };

  await TestBed.configureTestingModule({
    imports: [SidebarComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: AuthService, useValue: authStub },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');

  fixture = TestBed.createComponent(SidebarComponent);
  fixture.detectChanges();
}

function menuHrefs(): string[] {
  const anchors = Array.from(
    fixture.nativeElement.querySelectorAll('nav a[routerLink], nav a[href]')
  ) as HTMLAnchorElement[];
  return anchors.map(a => a.getAttribute('routerLink') ?? a.getAttribute('href') ?? '');
}

describe('SidebarComponent — role-based navigation menu', () => {
  it('admin sees exactly: Dashboard, Players, Coaches, Observers, Age Groups, Profile', async () => {
    await setup('admin');
    expect(menuHrefs()).toEqual(['/dashboard', '/players', '/users', '/observers', '/age-groups', '/profile']);
  });

  it('coach sees exactly: Dashboard, Players, My Matches, Profile', async () => {
    await setup('coach');
    expect(menuHrefs()).toEqual(['/dashboard', '/players', '/my-matches', '/profile']);
  });

  it('observer sees exactly: Dashboard, Players, My Matches, Profile', async () => {
    await setup('observer');
    expect(menuHrefs()).toEqual(['/dashboard', '/players', '/my-matches', '/profile']);
  });

  it('proScout sees exactly: Players, Profile', async () => {
    await setup('proScout');
    expect(menuHrefs()).toEqual(['/players', '/profile']);
  });

  it('proScout menu contains no age-groups, users, observers, dashboard, or my-matches entry (FR-008, FR-015)', async () => {
    await setup('proScout');
    const hrefs = menuHrefs();
    expect(hrefs).not.toContain('/age-groups');
    expect(hrefs).not.toContain('/users');
    expect(hrefs).not.toContain('/observers');
    expect(hrefs).not.toContain('/dashboard');
    expect(hrefs).not.toContain('/my-matches');
  });

  it('a role named on no entry sees zero menu entries (deny-by-default, FR-003, SC-007)', async () => {
    await setup('auditor' as UserRole);
    expect(menuHrefs()).toEqual([]);
  });

  it('no signed-in user sees zero menu entries (FR-003)', async () => {
    await setup(null);
    expect(menuHrefs()).toEqual([]);
  });

  it('a hidden entry is absent from the DOM, not merely styled hidden (FR-002)', async () => {
    await setup('proScout');
    // Only 2 anchors exist at all in the nav — not 7 with 5 hidden via CSS.
    const anchors = fixture.nativeElement.querySelectorAll('nav a');
    expect(anchors.length).toBe(2);
  });
});
