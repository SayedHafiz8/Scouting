import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';

function makeAuthSpy(authenticated: boolean): Partial<AuthService> {
  return {
    whenReady: Promise.resolve(),
    isAuthenticated: signal(authenticated) as any,
  };
}

async function runGuard(spy: Partial<AuthService>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: spy },
    ],
  });
  return TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
}

describe('authGuard', () => {
  it('returns true when user is authenticated', async () => {
    const result = await runGuard(makeAuthSpy(true));
    expect(result).toBeTrue();
  });

  it('redirects to /auth/login when user is not authenticated', async () => {
    const result = await runGuard(makeAuthSpy(false));
    expect(result).not.toBeTrue();
    // UrlTree.toString() yields the URL path string
    expect(result.toString()).toBe('/auth/login');
  });

  it('awaits whenReady before making auth decision', async () => {
    let resolve!: () => void;
    const spy: Partial<AuthService> = {
      whenReady: new Promise<void>(r => (resolve = r)),
      isAuthenticated: signal(true) as any,
    };

    const guardPromise = runGuard(spy);
    resolve();
    const result = await guardPromise;
    expect(result).toBeTrue();
  });

  it('returns UrlTree (not boolean) when not authenticated', async () => {
    const result = await runGuard(makeAuthSpy(false));
    // UrlTree is an object, not a boolean
    expect(typeof result).toBe('object');
  });
});
