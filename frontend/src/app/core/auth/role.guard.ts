import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { UserRole } from '../models/user.model';

export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await auth.whenReady;

    const role = auth.currentUser()?.role;
    if (role && allowedRoles.includes(role)) return true;
    const fallback = role === 'admin' ? '/dashboard/admin'
      : role === 'observer' ? '/dashboard/observer'
      : '/dashboard/coach';
    return router.createUrlTree([fallback]);
  };
