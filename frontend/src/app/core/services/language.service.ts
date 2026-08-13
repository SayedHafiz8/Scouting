import { Injectable, signal, effect } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type Lang = 'en' | 'ar';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly STORAGE_KEY = 'tr_lang';

  readonly current = signal<Lang>(this.saved());

  constructor(private translate: TranslateService) {
    effect(() => {
      const lang = this.current();
      translate.use(lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      localStorage.setItem(this.STORAGE_KEY, lang);
    });
  }

  toggle(): void {
    this.current.set(this.current() === 'en' ? 'ar' : 'en');
  }

  private saved(): Lang {
    return (localStorage.getItem(this.STORAGE_KEY) as Lang) ?? 'en';
  }
}
