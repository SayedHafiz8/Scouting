import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { UserRole } from './core/models/user.model';

// Single source of truth per route: the same list feeds both roleGuard
// (the actual access-control gate — unchanged) and RolePreloadStrategy's
// `data.preloadRoles` (fix P2), so the two can never drift apart.
const ADMIN_ONLY = ['admin'] as const satisfies readonly UserRole[];
const ADMIN_OR_OBSERVER = ['admin', 'observer'] as const satisfies readonly UserRole[];
const ADMIN_OR_COACH = ['admin', 'coach'] as const satisfies readonly UserRole[];
const MATCH_ROLES = ['coach', 'observer', 'admin', 'proScout'] as const satisfies readonly UserRole[];
const NEVER_PRELOAD = [] as const satisfies readonly UserRole[];

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.dashboardRoutes),
      },
      {
        path: 'players',
        loadChildren: () => import('./features/players/players.routes').then(m => m.playerRoutes),
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then(m => m.userRoutes),
        canActivate: [roleGuard(ADMIN_ONLY)],
        data: { preloadRoles: ADMIN_ONLY },
      },
      {
        path: 'observers',
        loadChildren: () => import('./features/observers/observers.routes').then(m => m.observerRoutes),
        canActivate: [roleGuard(ADMIN_ONLY)],
        data: { preloadRoles: ADMIN_ONLY },
      },
      {
        path: 'profile',
        loadChildren: () => import('./features/profile/profile.routes').then(m => m.profileRoutes),
      },
      {
        path: 'professional-league',
        loadChildren: () => import('./features/professional-league/professional-league.routes').then(m => m.professionalLeagueRoutes),
        canActivate: [roleGuard(ADMIN_ONLY)],
        data: { preloadRoles: ADMIN_ONLY },
      },
      {
        path: 'age-groups',
        loadChildren: () => import('./features/age-groups/age-groups.routes').then(m => m.ageGroupRoutes),
        canActivate: [roleGuard(ADMIN_ONLY)],
        data: { preloadRoles: ADMIN_ONLY },
      },
      {
        path: 'observer-evaluations',
        loadChildren: () => import('./features/observer-evaluations/observer-evaluations.routes').then(m => m.observerEvaluationRoutes),
        canActivate: [roleGuard(ADMIN_OR_OBSERVER)],
        data: { preloadRoles: ADMIN_OR_OBSERVER },
      },
      {
        path: 'coach-evaluations',
        loadChildren: () => import('./features/coach-evaluations/coach-evaluations.routes').then(m => m.coachEvaluationRoutes),
        canActivate: [roleGuard(ADMIN_OR_COACH)],
        data: { preloadRoles: ADMIN_OR_COACH },
      },
      {
        path: 'my-matches',
        loadComponent: () => import('./features/season-matches/my-matches/my-matches.component').then(m => m.MyMatchesComponent),
        canActivate: [roleGuard(MATCH_ROLES)],
        data: { preloadRoles: MATCH_ROLES },
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.authRoutes),
    // A signed-in user (the only case RolePreloadStrategy preloads for at
    // all) has no business pulling the login chunk into memory.
    data: { preloadRoles: NEVER_PRELOAD },
  },
  {
    // خارج authGuard/ShellComponent عمداً — الوجهة الافتراضية لأي رول بلا وجهة
    // معرّفة (RoleLandingService)، ولا يجوز حراستها بـ roleGuard (FR-008: انتهاء
    // بلا إعادة توجيه إضافية).
    path: 'unauthorized',
    loadComponent: () => import('./features/unauthorized/unauthorized.component').then(m => m.UnauthorizedComponent),
    data: { preloadRoles: NEVER_PRELOAD },
  },
  { path: '**', redirectTo: 'dashboard' },
];
