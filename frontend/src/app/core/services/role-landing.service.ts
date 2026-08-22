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
      // مؤقت — هيتغيّر لـ /dashboard/proScout في المرحلة 5 (DF-001).
      //
      // كل الرولات التانية بتهبط على داشبوردها. الرول ده لسه مالوش واحد
      // (GET /dashboard/proScout والصفحة بتاعتها شغل المرحلة 5)، وغيابه من
      // الـswitch كان بيوقّعه في الـdefault → /unauthorized، يعني تسجيل دخول
      // ناجح بينتهي بصفحة رفض وشغل المرحلة 4 كله مش موصول بالمستخدم.
      //
      // /players هي الوجهة الصح مؤقتاً: هي الصفحة الوحيدة اللي الرول بيشتغل
      // عليها فعلاً دلوقتي (قراءة وكتابة، المرحلة 4)، ومحروسة على السيرفر.
      //
      // ⚠️ المرحلة 5 **تعدّل السطر ده**، مش تضيف case جديد — أي case تاني
      // لنفس الرول معناه فرعين متناقضين في نفس الـswitch.
      case 'proScout':
        return ['/players'];
      default:
        return ['/unauthorized'];
    }
  }
}
