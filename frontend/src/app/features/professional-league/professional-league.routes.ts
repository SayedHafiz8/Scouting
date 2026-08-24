import { Routes } from '@angular/router';

export const professionalLeagueRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./professional-league-page/professional-league-page.component').then(m => m.ProfessionalLeaguePageComponent),
  },
  {
    path: 'pro-scouts/new',
    loadComponent: () => import('../users/user-form/user-form.component').then(m => m.UserFormComponent),
  },
  {
    path: 'pro-scouts/:userId/edit',
    loadComponent: () => import('../users/user-form/user-form.component').then(m => m.UserFormComponent),
  },
  {
    path: 'pro-scouts/:userId',
    loadComponent: () => import('../users/user-detail/user-detail.component').then(m => m.UserDetailComponent),
  },
];
