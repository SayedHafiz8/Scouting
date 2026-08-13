import { Routes } from '@angular/router';

export const observerRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./observer-list/observer-list.component').then(m => m.ObserverListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('../users/user-form/user-form.component').then(m => m.UserFormComponent),
  },
  {
    path: ':userId/edit',
    loadComponent: () => import('../users/user-form/user-form.component').then(m => m.UserFormComponent),
  },
  {
    path: ':userId',
    loadComponent: () => import('../users/user-detail/user-detail.component').then(m => m.UserDetailComponent),
  },
];
