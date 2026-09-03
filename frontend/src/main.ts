import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// audit-frontend P5 — eventCoalescing بيدمج أحداث الـDOM المتتالية اللي بتحصل في
// نفس المهمة في دورة change detection واحدة بدل دورة لكل حدث. من غيره كل
// mouseenter/mouseleave/scroll كان بيشغّل دورة مستقلة.
bootstrapApplication(AppComponent, {...appConfig, providers: [provideZoneChangeDetection({ eventCoalescing: true }), ...appConfig.providers]})
  .catch((err) => console.error(err));
