import { Component, input, output, inject, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models/user.model';
import { PlayerContextService } from '../../core/services/player-context.service';

type NavIcon = 'dashboard' | 'players' | 'coaches' | 'observers' | 'age-groups' | 'my-matches' | 'profile';

interface NavItem {
  labelKey: string;
  icon: NavIcon;
  route: string;
  roles: readonly UserRole[];
}

// Declaration order is render order (contracts/navigation-matrix.md §1). An entry
// renders only when the signed-in user's role is named here — deny-by-default,
// not a hand-written @if per role (Constitution Principles II, VII).
const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'NAV.DASHBOARD',  icon: 'dashboard',   route: '/dashboard',   roles: ['admin', 'coach', 'observer', 'proScout'] },
  { labelKey: 'NAV.PLAYERS',    icon: 'players',     route: '/players',     roles: ['admin', 'coach', 'observer', 'proScout'] },
  { labelKey: 'NAV.COACHES',    icon: 'coaches',     route: '/users',       roles: ['admin'] },
  { labelKey: 'NAV.OBSERVERS',  icon: 'observers',   route: '/observers',   roles: ['admin'] },
  { labelKey: 'NAV.AGE_GROUPS', icon: 'age-groups',  route: '/age-groups',  roles: ['admin'] },
  { labelKey: 'NAV.MY_MATCHES', icon: 'my-matches',  route: '/my-matches',  roles: ['coach', 'observer', 'proScout'] },
  { labelKey: 'NAV.PROFILE',    icon: 'profile',     route: '/profile',     roles: ['admin', 'coach', 'observer', 'proScout'] },
];

const STATUS_CHILDREN = [
  { labelKey: 'NAV.SELECTED', status: 'selected', color: '#22c55e' },
  { labelKey: 'NAV.PENDING',  status: 'pending',  color: '#f59e0b' },
  { labelKey: 'NAV.REJECTED', status: 'rejected', color: '#ef4444' },
] as const;

@Component({
    selector: 'app-sidebar',
    imports: [RouterLink, RouterLinkActive, TranslatePipe],
    template: `
    <aside
      class="fixed inset-y-0 left-0 z-50 flex flex-col w-64 transition-transform duration-300 ease-in-out lg:relative lg:z-auto lg:translate-x-0 lg:flex lg:h-full border-r"
      style="background:var(--sidebar-bg); border-color:var(--sidebar-border)"
      [class.translate-x-0]="!collapsed()"
      [class.-translate-x-full]="collapsed()"
    >
      <!-- Logo -->
      <div class="flex items-center px-3 py-2 border-b" style="border-color:var(--sidebar-border)">
        <img src="/assets/logo.png" alt="Talent Radar"
             style="height:68px; width:auto; max-width:220px; object-fit:contain; filter:brightness(0) invert(1);" />
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">

        @for (item of visibleNavItems(); track item.route) {
          <a [routerLink]="item.route" routerLinkActive="sidebar-active"
             class="sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150"
             (click)="onNavClick()">
            <span class="w-5 h-5 flex-shrink-0">
              @switch (item.icon) {
                @case ('dashboard') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                }
                @case ('players') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                  </svg>
                }
                @case ('coaches') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                }
                @case ('observers') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                }
                @case ('age-groups') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="3" width="6" height="18"/><rect x="9" y="8" width="6" height="13"/>
                    <rect x="16" y="12" width="6" height="9"/>
                  </svg>
                }
                @case ('my-matches') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                }
                @case ('profile') {
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                }
              }
            </span>
            <span class="text-sm font-medium">{{ item.labelKey | translate }}</span>
          </a>
        }

      </nav>

      <!-- Mini pitch (admin on players page) -->
      @if (isAdmin() && isPlayersActive()) {
        <div class="px-3 py-3 border-t" style="border-color:var(--sidebar-border)">
          <p class="text-xs font-semibold mb-2 text-center" style="color:var(--sidebar-text-muted)">4-3-2-1</p>
          <svg viewBox="0 0 200 310" class="w-full rounded-lg">
            <!-- Field background -->
            <rect width="200" height="310" rx="8" fill="#166534"/>
            <!-- Alternating stripes -->
            <rect x="10" y="10"  width="180" height="48" fill="#15803d" opacity="0.5"/>
            <rect x="10" y="58"  width="180" height="48" fill="#166534" opacity="0.5"/>
            <rect x="10" y="106" width="180" height="48" fill="#15803d" opacity="0.5"/>
            <rect x="10" y="154" width="180" height="48" fill="#166534" opacity="0.5"/>
            <rect x="10" y="202" width="180" height="48" fill="#15803d" opacity="0.5"/>
            <rect x="10" y="250" width="180" height="50" fill="#166534" opacity="0.5"/>
            <!-- Outer boundary -->
            <rect x="10" y="10" width="180" height="290" stroke="white" stroke-width="1.5" fill="none" opacity="0.7"/>
            <!-- Halfway line -->
            <line x1="10" y1="155" x2="190" y2="155" stroke="white" stroke-width="1" opacity="0.5"/>
            <!-- Center circle -->
            <circle cx="100" cy="155" r="22" stroke="white" stroke-width="1" fill="none" opacity="0.4"/>
            <circle cx="100" cy="155" r="2" fill="white" opacity="0.5"/>
            <!-- Top penalty box -->
            <rect x="52" y="10"  width="96" height="42" stroke="white" stroke-width="1" fill="none" opacity="0.4"/>
            <rect x="72" y="10"  width="56" height="20" stroke="white" stroke-width="1" fill="none" opacity="0.4"/>
            <rect x="84" y="4"   width="32" height="9"  stroke="white" stroke-width="2" fill="none" opacity="0.8"/>
            <!-- Bottom penalty box -->
            <rect x="52" y="258" width="96" height="42" stroke="white" stroke-width="1" fill="none" opacity="0.4"/>
            <rect x="72" y="278" width="56" height="22" stroke="white" stroke-width="1" fill="none" opacity="0.4"/>
            <rect x="84" y="297" width="32" height="9"  stroke="white" stroke-width="2" fill="none" opacity="0.8"/>

            <!-- GK -->
            <g (click)="filterByPosition('GK')" style="cursor:pointer">
              <circle cx="100" cy="278" [attr.r]="isActivePos('GK') ? 14 : 11"
                      [attr.fill]="isActivePos('GK') ? '#fff' : '#fbbf24'"
                      [attr.stroke]="isActivePos('GK') ? '#fbbf24' : 'white'"
                      [attr.stroke-width]="isActivePos('GK') ? 3 : 1.5"/>
              <text x="100" y="283" text-anchor="middle" [attr.font-size]="isActivePos('GK') ? 8 : 7.5"
                    [attr.fill]="isActivePos('GK') ? '#92400e' : '#000'" font-weight="bold">GK</text>
            </g>

            <!-- LB -->
            <g (click)="filterByPosition('LB')" style="cursor:pointer">
              <circle cx="25" cy="228" [attr.r]="isActivePos('LB') ? 14 : 11"
                      [attr.fill]="isActivePos('LB') ? '#fff' : '#60a5fa'"
                      [attr.stroke]="isActivePos('LB') ? '#3b82f6' : 'white'"
                      [attr.stroke-width]="isActivePos('LB') ? 3 : 1.5"/>
              <text x="25" y="232" text-anchor="middle" font-size="7"
                    [attr.fill]="isActivePos('LB') ? '#1e3a8a' : '#000'" font-weight="bold">LB</text>
            </g>

            <!-- CB x2 -->
            <g (click)="filterByPosition('CB')" style="cursor:pointer">
              <circle cx="75" cy="228" [attr.r]="isActivePos('CB') ? 14 : 11"
                      [attr.fill]="isActivePos('CB') ? '#fff' : '#60a5fa'"
                      [attr.stroke]="isActivePos('CB') ? '#3b82f6' : 'white'"
                      [attr.stroke-width]="isActivePos('CB') ? 3 : 1.5"/>
              <text x="75" y="232" text-anchor="middle" font-size="7"
                    [attr.fill]="isActivePos('CB') ? '#1e3a8a' : '#000'" font-weight="bold">CB</text>
            </g>
            <g (click)="filterByPosition('CB')" style="cursor:pointer">
              <circle cx="125" cy="228" [attr.r]="isActivePos('CB') ? 14 : 11"
                      [attr.fill]="isActivePos('CB') ? '#fff' : '#60a5fa'"
                      [attr.stroke]="isActivePos('CB') ? '#3b82f6' : 'white'"
                      [attr.stroke-width]="isActivePos('CB') ? 3 : 1.5"/>
              <text x="125" y="232" text-anchor="middle" font-size="7"
                    [attr.fill]="isActivePos('CB') ? '#1e3a8a' : '#000'" font-weight="bold">CB</text>
            </g>

            <!-- RB -->
            <g (click)="filterByPosition('RB')" style="cursor:pointer">
              <circle cx="175" cy="228" [attr.r]="isActivePos('RB') ? 14 : 11"
                      [attr.fill]="isActivePos('RB') ? '#fff' : '#60a5fa'"
                      [attr.stroke]="isActivePos('RB') ? '#3b82f6' : 'white'"
                      [attr.stroke-width]="isActivePos('RB') ? 3 : 1.5"/>
              <text x="175" y="232" text-anchor="middle" font-size="7"
                    [attr.fill]="isActivePos('RB') ? '#1e3a8a' : '#000'" font-weight="bold">RB</text>
            </g>

            <!-- CMF -->
            <g (click)="filterByPosition('CM')" style="cursor:pointer">
              <circle cx="55" cy="158" [attr.r]="isActivePos('CM') ? 14 : 11"
                      [attr.fill]="isActivePos('CM') ? '#fff' : '#4ade80'"
                      [attr.stroke]="isActivePos('CM') ? '#22c55e' : 'white'"
                      [attr.stroke-width]="isActivePos('CM') ? 3 : 1.5"/>
              <text x="55" y="162" text-anchor="middle" font-size="6.5"
                    [attr.fill]="isActivePos('CM') ? '#14532d' : '#000'" font-weight="bold">CMF</text>
            </g>

            <!-- DMF -->
            <g (click)="filterByPosition('DM')" style="cursor:pointer">
              <circle cx="145" cy="158" [attr.r]="isActivePos('DM') ? 14 : 11"
                      [attr.fill]="isActivePos('DM') ? '#fff' : '#a78bfa'"
                      [attr.stroke]="isActivePos('DM') ? '#7c3aed' : 'white'"
                      [attr.stroke-width]="isActivePos('DM') ? 3 : 1.5"/>
              <text x="145" y="162" text-anchor="middle" font-size="6.5"
                    [attr.fill]="isActivePos('DM') ? '#3b0764' : '#000'" font-weight="bold">DMF</text>
            </g>

            <!-- AMF -->
            <g (click)="filterByPosition('AM')" style="cursor:pointer">
              <circle cx="100" cy="115" [attr.r]="isActivePos('AM') ? 14 : 11"
                      [attr.fill]="isActivePos('AM') ? '#fff' : '#4ade80'"
                      [attr.stroke]="isActivePos('AM') ? '#22c55e' : 'white'"
                      [attr.stroke-width]="isActivePos('AM') ? 3 : 1.5"/>
              <text x="100" y="119" text-anchor="middle" font-size="6.5"
                    [attr.fill]="isActivePos('AM') ? '#14532d' : '#000'" font-weight="bold">AMF</text>
            </g>

            <!-- LWF -->
            <g (click)="filterByPosition('LW')" style="cursor:pointer">
              <circle cx="38" cy="65" [attr.r]="isActivePos('LW') ? 14 : 11"
                      [attr.fill]="isActivePos('LW') ? '#fff' : '#fb923c'"
                      [attr.stroke]="isActivePos('LW') ? '#ea580c' : 'white'"
                      [attr.stroke-width]="isActivePos('LW') ? 3 : 1.5"/>
              <text x="38" y="69" text-anchor="middle" font-size="6.5"
                    [attr.fill]="isActivePos('LW') ? '#7c2d12' : '#000'" font-weight="bold">LWF</text>
            </g>

            <!-- RWF -->
            <g (click)="filterByPosition('RW')" style="cursor:pointer">
              <circle cx="162" cy="65" [attr.r]="isActivePos('RW') ? 14 : 11"
                      [attr.fill]="isActivePos('RW') ? '#fff' : '#fb923c'"
                      [attr.stroke]="isActivePos('RW') ? '#ea580c' : 'white'"
                      [attr.stroke-width]="isActivePos('RW') ? 3 : 1.5"/>
              <text x="162" y="69" text-anchor="middle" font-size="6.5"
                    [attr.fill]="isActivePos('RW') ? '#7c2d12' : '#000'" font-weight="bold">RWF</text>
            </g>

            <!-- CF -->
            <g (click)="filterByPosition('ST')" style="cursor:pointer">
              <circle cx="100" cy="45" [attr.r]="isActivePos('ST') ? 14 : 11"
                      [attr.fill]="isActivePos('ST') ? '#fff' : '#f87171'"
                      [attr.stroke]="isActivePos('ST') ? '#ef4444' : 'white'"
                      [attr.stroke-width]="isActivePos('ST') ? 3 : 1.5"/>
              <text x="100" y="49" text-anchor="middle" font-size="7"
                    [attr.fill]="isActivePos('ST') ? '#7f1d1d' : '#000'" font-weight="bold">CF</text>
            </g>
          </svg>
        </div>
      }

      <!-- User info -->
      <div class="px-4 py-4 border-t" style="border-color:var(--sidebar-border)">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            {{ userInitials() }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate" style="color:var(--sidebar-text)">{{ auth.currentUser()?.name }}</p>
            <p class="text-xs truncate capitalize" style="color:var(--sidebar-text-muted)">{{ auth.currentUser()?.role }}</p>
          </div>
        </div>
      </div>
    </aside>
  `,
    styles: [`
    .sidebar-nav-item {
      color: var(--sidebar-text);
      position: relative;
    }
    .sidebar-nav-item:hover {
      background-color: var(--sidebar-hover-bg);
      color: var(--text-primary);
    }
    .sidebar-active {
      background-color: var(--sidebar-active-bg) !important;
      color: var(--sidebar-active-text) !important;
    }
    .sidebar-active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      background: var(--accent);
      border-radius: 0 3px 3px 0;
    }
    .sidebar-child {
      color: var(--sidebar-text-muted);
    }
    .sidebar-child:hover {
      background-color: var(--sidebar-hover-bg);
      color: var(--sidebar-text);
    }
    .sidebar-child-active {
      color: var(--sidebar-active-text) !important;
      background-color: var(--sidebar-active-bg) !important;
    }
    .dropdown-list {
      animation: dropDown 0.2s ease;
      overflow: hidden;
    }
    @keyframes dropDown {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class SidebarComponent {
  readonly collapsed = input<boolean>(false);
  readonly toggleSidebar = output<void>();

  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly playerContext = inject(PlayerContextService);

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');
  readonly playersOpen = signal(false);

  // Deny-by-default: absent role or a role named on no entry yields []. Can only
  // grow as the session resolves, never shrink (research.md R8).
  readonly visibleNavItems = computed(() => {
    const role = this.auth.currentUser()?.role;
    if (!role) return [];
    return NAV_ITEMS.filter(item => item.roles.includes(role));
  });

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: any) => e.urlAfterRedirects as string),
      startWith(this.router.url)
    )
  );
  readonly isPlayersActive = computed(() => (this.currentUrl() ?? '').startsWith('/players'));

  isActivePos(pos: string): boolean {
    return this.playerContext.activePosition() === pos
        || this.playerContext.filterPosition() === pos;
  }

  filterByPosition(pos: string): void {
    const current = this.playerContext.filterPosition();
    if (current === pos) {
      this.playerContext.setFilter(null);
      this.router.navigate(['/players'], { queryParams: {} });
    } else {
      this.playerContext.setFilter(pos);
      this.router.navigate(['/players'], { queryParams: { position: pos } });
    }
  }
  readonly statusChildren = STATUS_CHILDREN;

  readonly userInitials = computed(() => {
    const name = this.auth.currentUser()?.name ?? '';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  });

  onNavClick(): void {
    if (window.innerWidth < 1024) {
      this.toggleSidebar.emit();
    }
  }
}
