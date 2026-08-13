import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// أي محاولة دخول لأي لينك من غير تسجيل دخول بترجع لصفحة اللوجين
// (مع حفظ اللينك المطلوب في returnUrl عشان يرجعله بعد ما يسجّل)
export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady;

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/auth/login'], {
    queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {},
  });
};
