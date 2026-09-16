import { Routes } from '@angular/router';

export const userRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./user-list/user-list.component').then(m => m.UserListComponent),
  },
  {
    // ?role=coach|observer|proScout — نفس الصفحة بتخدم التلاتة
    path: 'deactivated',
    loadComponent: () => import('./deactivated-users/deactivated-users.component').then(m => m.DeactivatedUsersComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./user-form/user-form.component').then(m => m.UserFormComponent),
  },
  {
    path: ':userId/edit',
    loadComponent: () => import('./user-form/user-form.component').then(m => m.UserFormComponent),
  },
  {
    path: ':userId',
    loadComponent: () => import('./user-detail/user-detail.component').then(m => m.UserDetailComponent),
  },
];
