import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';

export const observerEvaluationRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./observer-evaluation-list/observer-evaluation-list.component').then(m => m.ObserverEvaluationListComponent),
    canActivate: [roleGuard(['admin', 'observer'])],
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./observer-evaluation-form/observer-evaluation-form.component').then(m => m.ObserverEvaluationFormComponent),
    canActivate: [roleGuard(['admin'])],
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./observer-evaluation-detail/observer-evaluation-detail.component').then(m => m.ObserverEvaluationDetailComponent),
    canActivate: [roleGuard(['admin', 'observer'])],
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./observer-evaluation-form/observer-evaluation-form.component').then(m => m.ObserverEvaluationFormComponent),
    canActivate: [roleGuard(['admin'])],
  },
];
