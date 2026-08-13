import { Routes } from '@angular/router';

export const playerRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./player-list/player-list.component').then(m => m.PlayerListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./player-form/player-form.component').then(m => m.PlayerFormComponent),
  },
  {
    path: ':playerId',
    loadComponent: () => import('./player-detail/player-detail.component').then(m => m.PlayerDetailComponent),
    children: [
      {
        path: 'reports',
        loadComponent: () => import('../scouting-reports/report-list/report-list.component').then(m => m.ReportListComponent),
      },
      {
        path: 'reports/new',
        loadComponent: () => import('../scouting-reports/report-form/report-form.component').then(m => m.ReportFormComponent),
      },
      {
        path: 'reports/:reportId',
        loadComponent: () => import('../scouting-reports/report-detail/report-detail.component').then(m => m.ReportDetailComponent),
      },
      {
        path: 'media',
        loadComponent: () => import('../media/media-gallery/media-gallery.component').then(m => m.MediaGalleryComponent),
      },
      { path: '', redirectTo: 'reports', pathMatch: 'full' },
    ],
  },
  {
    path: ':playerId/edit',
    loadComponent: () => import('./player-form/player-form.component').then(m => m.PlayerFormComponent),
  },
];
