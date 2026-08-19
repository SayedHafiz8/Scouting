import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RoleLandingService } from '../services/role-landing.service';
import { UserRole } from '../models/user.model';

export const roleGuard = (allowedRoles: UserRole[]): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const roleLanding = inject(RoleLandingService);

    await auth.whenReady;

    const role = auth.currentUser()?.role;
    if (role && allowedRoles.includes(role)) return true;
    // رول قائم بدون صلاحية للمسار ده → وجهته المعتادة (بلا تغيير). رول غير معروف
    // (بما فيه غياب المستخدم) → /unauthorized بدل التخمين (FR-007، يغلق C-1).
    return router.createUrlTree(roleLanding.landingFor(role));
  };
