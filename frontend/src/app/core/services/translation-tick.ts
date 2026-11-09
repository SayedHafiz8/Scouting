import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

/**
 * إشارة بتتحرك كل ما الترجمات تتغير فعليًا (تبديل لغة، أو وصول ملف اللغة).
 *
 * ليه موجودة: `translate.instant()` دالة عادية — منداها جوه `computed()` بيتقفل
 * على النص بتاع اللحظة دي، فلو اللغة اتغيرت الـcomputed مايعرفش ومايعيدش الحساب.
 * الكود القديم كان بيتفادى ده بإنه ينده الدالة من القالب نفسه، فبتتنفّذ في **كل**
 * دورة تغيير — ١٥ ترجمة × كل دورة في صفحة التقارير مثلاً.
 *
 * ⚠️ `translate.currentLang` إشارة جاهزة في ngx-translate 18، بس هي **مش** كافية
 * هنا: أول ما التطبيق يقوم بتتحط بقيمة اللغة **قبل** ما ملفها يتحمّل، وبعد ما
 * يتحمّل بتتحط بنفس القيمة — يعني مفيش تغيير تقرا منه الإشارة، والـcomputed
 * بيفضل ماسك المفاتيح الخام. `onTranslationRefresh` هي اللي بتضرب في الحالتين،
 * وهي نفس اللي بتعتمد عليها TranslatePipe جوه المكتبة.
 *
 * الاستخدام: نده الإشارة في أول الـcomputed عشان تتسجّل كاعتماد، وبعدها ترجم:
 * ```ts
 * readonly labels = computed(() => {
 *   this.i18nTick();
 *   return keys.map(k => this.translate.instant(k));
 * });
 * ```
 */
export function translationTick(): Signal<number> {
    const translate = inject(TranslateService);
    let n = 0;
    return toSignal(translate.onTranslationRefresh.pipe(map(() => ++n)), { initialValue: 0 });
}
