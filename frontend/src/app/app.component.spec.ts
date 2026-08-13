import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth/auth.service';
import { ThemeService } from './core/services/theme.service';

function makeAuthSpy(ready: boolean): Partial<AuthService> {
  return {
    isReady: signal(ready) as any,
    currentUser: signal(null) as any,
    whenReady: Promise.resolve(),
  };
}

describe('AppComponent', () => {
  function setup(ready: boolean) {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: makeAuthSpy(ready) },
        { provide: ThemeService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('should create', () => {
    const fixture = setup(true);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows splash screen while auth is not ready', () => {
    const fixture = setup(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.splash-screen')).toBeTruthy();
    expect(el.querySelector('router-outlet')).toBeFalsy();
  });

  it('shows router-outlet when auth is ready', () => {
    const fixture = setup(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.splash-screen')).toBeFalsy();
    expect(el.querySelector('router-outlet')).toBeTruthy();
  });
});
