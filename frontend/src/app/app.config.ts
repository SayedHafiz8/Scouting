import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withPreloading, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { AuthService } from './core/auth/auth.service';
import { LanguageService } from './core/services/language.service';
import { RolePreloadStrategy } from './core/routing/role-preload.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    // Frontend audit fixes P1 + P2:
    //  - provideAnimations() removed — zero @angular/animations usage anywhere
    //    in this app (all motion is CSS keyframes); it cost 63.49 kB raw /
    //    16.84 kB transfer on the initial bundle for nothing.
    //  - PreloadAllModules → RolePreloadStrategy — preload only the lazy
    //    chunks the signed-in user's role can actually navigate to, deferred
    //    to idle time.
    provideRouter(routes, withPreloading(RolePreloadStrategy), withEnabledBlockingInitialNavigation()),
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor]),
      withFetch()
    ),
    provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
    provideTranslateHttpLoader({ prefix: '/assets/i18n/', suffix: '.json' }),
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () => auth.loadUserFromToken(),
      deps: [AuthService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (lang: LanguageService) => () => lang.current(),
      deps: [LanguageService],
      multi: true,
    },
  ],
};
