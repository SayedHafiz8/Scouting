import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { roleGuard } from '../../core/auth/role.guard';
import { RoleLandingService } from '../../core/services/role-landing.service';

export const dashboardRoutes: Routes = [
  {
    path: 'coach',
    loadComponent: () => import('./coach-dashboard/coach-dashboard.component').then(m => m.CoachDashboardComponent),
    canActivate: [roleGuard(['coach'])],
  },
  {
    path: 'admin',
    loadComponent: () => import('./admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [roleGuard(['admin'])],
  },
  {
    path: 'admin/:coachId',
    loadComponent: () => import('./admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [roleGuard(['admin'])],
  },
  {
    path: 'observer',
    loadComponent: () => import('./observer-dashboard/observer-dashboard.component').then(m => m.ObserverDashboardComponent),
    canActivate: [roleGuard(['observer'])],
  },
  {
    path: 'admin/observer/:observerId',
    loadComponent: () => import('./observer-dashboard/observer-dashboard.component').then(m => m.ObserverDashboardComponent),
    canActivate: [roleGuard(['admin'])],
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
