import { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/role.guard';

export const coachEvaluationRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./coach-evaluation-list/coach-evaluation-list.component').then(m => m.CoachEvaluationListComponent),
    canActivate: [roleGuard(['admin', 'coach'])],
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./coach-evaluation-form/coach-evaluation-form.component').then(m => m.CoachEvaluationFormComponent),
    canActivate: [roleGuard(['admin'])],
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./coach-evaluation-detail/coach-evaluation-detail.component').then(m => m.CoachEvaluationDetailComponent),
    canActivate: [roleGuard(['admin', 'coach'])],
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./coach-evaluation-form/coach-evaluation-form.component').then(m => m.CoachEvaluationFormComponent),
    canActivate: [roleGuard(['admin'])],
  },
];
