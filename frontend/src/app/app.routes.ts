import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';

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
        canActivate: [roleGuard(['admin'])],
      },
      {
        path: 'observers',
        loadChildren: () => import('./features/observers/observers.routes').then(m => m.observerRoutes),
        canActivate: [roleGuard(['admin'])],
      },
      {
        path: 'profile',
        loadChildren: () => import('./features/profile/profile.routes').then(m => m.profileRoutes),
      },
      {
        path: 'professional-league',
        loadChildren: () => import('./features/professional-league/professional-league.routes').then(m => m.professionalLeagueRoutes),
        canActivate: [roleGuard(['admin'])],
      },
      {
        path: 'age-groups',
        loadChildren: () => import('./features/age-groups/age-groups.routes').then(m => m.ageGroupRoutes),
        canActivate: [roleGuard(['admin'])],
      },
      {
        path: 'observer-evaluations',
        loadChildren: () => import('./features/observer-evaluations/observer-evaluations.routes').then(m => m.observerEvaluationRoutes),
        canActivate: [roleGuard(['admin', 'observer'])],
      },
      {
        path: 'coach-evaluations',
        loadChildren: () => import('./features/coach-evaluations/coach-evaluations.routes').then(m => m.coachEvaluationRoutes),
        canActivate: [roleGuard(['admin', 'coach'])],
      },
      {
        path: 'my-matches',
        loadComponent: () => import('./features/season-matches/my-matches/my-matches.component').then(m => m.MyMatchesComponent),
        canActivate: [roleGuard(['coach', 'observer', 'admin', 'proScout'])],
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.authRoutes),
  },
  {
    // خارج authGuard/ShellComponent عمداً — الوجهة الافتراضية لأي رول بلا وجهة
    // معرّفة (RoleLandingService)، ولا يجوز حراستها بـ roleGuard (FR-008: انتهاء
    // بلا إعادة توجيه إضافية).
    path: 'unauthorized',
    loadComponent: () => import('./features/unauthorized/unauthorized.component').then(m => m.UnauthorizedComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
