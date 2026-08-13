import { Injectable, signal } from '@angular/core';

export interface BreadcrumbAuthor {
  id: string;
  name: string;
}

// بيسمح لصفحة تفاصيل الريبورت إنها تبلغ البريدكرمب في صفحة اللاعب باسم كاتب الريبورت الفعلي (كوتش أو أوبزيرفر)
@Injectable({ providedIn: 'root' })
export class BreadcrumbContextService {
  readonly reportAuthor = signal<BreadcrumbAuthor | null>(null);

  setReportAuthor(author: BreadcrumbAuthor | null): void {
    this.reportAuthor.set(author);
  }

  clearReportAuthor(): void {
    this.reportAuthor.set(null);
  }
}
