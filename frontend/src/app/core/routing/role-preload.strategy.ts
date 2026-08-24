import { Injectable, InjectionToken, NgZone, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, Observable, Subscription, catchError, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../models/user.model';

export type PreloadScheduler = (task: () => void) => void;

// Deferral seam — specs override this with a synchronous scheduler so
// preloading decisions are deterministic under Karma/Jasmine.
export const PRELOAD_SCHEDULER = new InjectionToken<PreloadScheduler>('PRELOAD_SCHEDULER', {
  providedIn: 'root',
  factory: () => {
    const zone = inject(NgZone);
    const ric = (globalThis as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    // Outside the Angular zone: zone.js does NOT patch requestIdleCallback, but it
    // DOES patch setTimeout — an in-zone Safari fallback would leave the app
    // permanently "unstable" (ApplicationRef.isStable never settles). `timeout`
    // guarantees the callback still fires on a busy page.
    return (task: () => void) =>
      zone.runOutsideAngular(() => (ric ? ric(task, { timeout: 2000 }) : setTimeout(task, 1000)));
  },
});

// Frontend audit fix P2 — replaces PreloadAllModules, which pulled every lazy
// chunk (~593 kB raw beyond the initial bundle) into every session regardless
// of role: a coach used to preload the admin user-management pages, all four
// role dashboards, etc. A route with no `data.preloadRoles` is a shared route
// and still preloads for everyone; a route that lists roles only preloads for
// a signed-in user whose role is in that list. Preloading itself is deferred
// to idle time so it never competes with the current page's own requests.
@Injectable({ providedIn: 'root' })
export class RolePreloadStrategy implements PreloadingStrategy {
  private readonly auth = inject(AuthService);
  private readonly schedule = inject(PRELOAD_SCHEDULER);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!this.shouldPreload(route)) return EMPTY;

    return new Observable<unknown>(subscriber => {
      let inner: Subscription | undefined;
      let cancelled = false;
      this.schedule(() => {
        if (cancelled) return;
        // A failed preload must never surface as a navigation error — same
        // contract PreloadAllModules gave the router.
        inner = load().pipe(catchError(() => of(null))).subscribe(subscriber);
      });
      return () => {
        cancelled = true;
        inner?.unsubscribe();
      };
    });
  }

  private shouldPreload(route: Route): boolean {
    const role = this.auth.currentUser()?.role;
    if (!role) return false; // anonymous (login screen) → preload nothing
    const allowed = route.data?.['preloadRoles'] as readonly UserRole[] | undefined;
    return !allowed || allowed.includes(role); // no marker → shared route
  }
}
