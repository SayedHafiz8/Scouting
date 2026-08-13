import { Routes } from '@angular/router';

export const ageGroupRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./age-group-list/age-group-list.component').then(m => m.AgeGroupListComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./age-group-detail/age-group-detail.component').then(m => m.AgeGroupDetailComponent),
  },
];
