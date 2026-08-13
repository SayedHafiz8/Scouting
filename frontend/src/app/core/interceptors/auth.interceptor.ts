import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

const AUTH_SKIP_URLS = ['/auth/refreshToken', '/auth/login', '/auth/logout', '/auth/signup', '/auth/forgotPassword', '/auth/verifyResetCode', '/auth/resetPassword'];

function shouldSkip(url: string): boolean {
  return AUTH_SKIP_URLS.some(s => url.includes(s));
}

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (shouldSkip(req.url)) return next(req);

  const currentToken = auth.accessToken();
  const authReq = currentToken ? addToken(req, currentToken) : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse): Observable<HttpEvent<unknown>> => {
      if (err.status !== 401 || shouldSkip(req.url)) {
        return throwError(() => err);
      }

      // Don't attempt refresh if there's no session to restore
      if (!sessionStorage.getItem('tr_user') && !auth.accessToken()) {
        return throwError(() => err);
      }

      if (!isRefreshing) {
        isRefreshing = true;
        refreshTokenSubject.next(null);

        return from(auth.refreshAccessToken()).pipe(
          switchMap((newToken: string) => {
            isRefreshing = false;
            refreshTokenSubject.next(newToken);
            return next(addToken(req, newToken));
          }),
          catchError((refreshErr: unknown) => {
            isRefreshing = false;
            auth.clearSession();
            router.navigate(['/auth/login']);
            return throwError(() => refreshErr);
          })
        ) as Observable<HttpEvent<unknown>>;
      }

      return refreshTokenSubject.pipe(
        filter((t): t is string => t !== null),
        take(1),
        switchMap(t => next(addToken(req, t)))
      );
    })
  );
};
