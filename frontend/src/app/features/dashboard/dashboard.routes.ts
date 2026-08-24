import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { roleGuard } from '../../core/auth/role.guard';
import { RoleLandingService } from '../../core/services/role-landing.service';
import { UserRole } from '../../core/models/user.model';

// `dashboard` is every role's landing route, so its loadChildren always
// resolves — Route.data does NOT inherit parent→child, so without an explicit
// preloadRoles on each child here, RolePreloadStrategy would preload all four
// role-specific dashboard chunks for every role (frontend audit fix P2).
const COACH_ONLY = ['coach'] as const satisfies readonly UserRole[];
const ADMIN_ONLY = ['admin'] as const satisfies readonly UserRole[];
const OBSERVER_ONLY = ['observer'] as const satisfies readonly UserRole[];
const PROSCOUT_ONLY = ['proScout'] as const satisfies readonly UserRole[];

export const dashboardRoutes: Routes = [
  {
    path: 'coach',
    loadComponent: () => import('./coach-dashboard/coach-dashboard.component').then(m => m.CoachDashboardComponent),
    canActivate: [roleGuard(COACH_ONLY)],
    data: { preloadRoles: COACH_ONLY },
  },
  {
    path: 'admin',
    loadComponent: () => import('./admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [roleGuard(ADMIN_ONLY)],
    data: { preloadRoles: ADMIN_ONLY },
  },
  {
    path: 'admin/:coachId',
    loadComponent: () => import('./admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [roleGuard(ADMIN_ONLY)],
    data: { preloadRoles: ADMIN_ONLY },
  },
  {
    path: 'observer',
    loadComponent: () => import('./observer-dashboard/observer-dashboard.component').then(m => m.ObserverDashboardComponent),
    canActivate: [roleGuard(OBSERVER_ONLY)],
    data: { preloadRoles: OBSERVER_ONLY },
  },
  {
    path: 'admin/observer/:observerId',
    loadComponent: () => import('./observer-dashboard/observer-dashboard.component').then(m => m.ObserverDashboardComponent),
    canActivate: [roleGuard(ADMIN_ONLY)],
    data: { preloadRoles: ADMIN_ONLY },
  },
  {
    path: 'proScout',
    loadComponent: () => import('./pro-scout-dashboard/pro-scout-dashboard.component').then(m => m.ProScoutDashboardComponent),
    canActivate: [roleGuard(PROSCOUT_ONLY)],
    data: { preloadRoles: PROSCOUT_ONLY },
  },
  {
    path: '',
    canActivate: [() => {
      const role = inject(AuthService).currentUser()?.role;
      const target = inject(RoleLandingService).landingFor(role);
      return inject(Router).createUrlTree(target);
    }],
    children: [],
  },
];
