import { Injectable } from '@angular/core';
import { UserRole } from '../models/user.model';

// المصدر الوحيد لاشتقاق وجهة الرول (Constitution Principle VII — منطق تحديد الوجهة حسب
// الرول MUST يُعرَّف مرة واحدة). role.guard.ts و dashboard.routes.ts يستدعيان هذه
// الخدمة بدل تكرار المنطق محلياً. أي رول غير معروف (بما فيه undefined) يذهب لـ
// /unauthorized بدل التخمين — هذا ما يغلق حلقة إعادة التوجيه (Constraint C-1).
@Injectable({ providedIn: 'root' })
export class RoleLandingService {
  landingFor(role: UserRole | undefined): string[] {
    switch (role) {
      case 'admin':
        return ['/dashboard/admin'];
      case 'coach':
        return ['/dashboard/coach'];
      case 'observer':
        return ['/dashboard/observer'];
      // DF-001 discharged (Stage 5) — الرول عنده داشبورد بتاعه دلوقتي
      // (GET /dashboard/proScout + الصفحة)، فبيهبط عليه زي أي رول تاني.
      case 'proScout':
        return ['/dashboard/proScout'];
      default:
        return ['/unauthorized'];
    }
  }
}
