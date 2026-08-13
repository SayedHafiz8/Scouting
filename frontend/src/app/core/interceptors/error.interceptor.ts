import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ToastService } from '../services/toast.service';

// Maps backend message fragments → user-friendly Arabic.
// Order matters: more specific fragments must come before generic ones.
const MESSAGE_MAP: [string, string][] = [
  // ── Auth ──────────────────────────────────────────────
  ['incorrect email or password',        'البريد الإلكتروني أو كلمة المرور غير صحيحة'],
  ['invalid email or password',          'البريد الإلكتروني أو كلمة المرور غير صحيحة'],
  ['session has expired',                'انتهت الجلسة، سجّل الدخول مرة أخرى'],
  ['reset session is invalid',           'رابط إعادة التعيين غير صالح أو انتهت صلاحيته، ابدأ من جديد'],
  ['refresh token expired',              'انتهت الجلسة، سجّل الدخول مرة أخرى'],
  ['invalid refresh token',              'انتهت الجلسة، سجّل الدخول مرة أخرى'],
  ['no refresh token',                   'انتهت الجلسة، سجّل الدخول مرة أخرى'],
  ['invalid token',                      'التوكن غير صحيح، سجّل الدخول مرة أخرى'],
  ['no longer exists',                   'الحساب لم يعد موجوداً، سجّل الدخول مرة أخرى'],
  ['recently changed his password',      'تم تغيير كلمة المرور مؤخراً، سجّل الدخول مرة أخرى'],
  ['not logged in',                      'يرجى تسجيل الدخول أولاً'],
  ['incorrect current password',         'كلمة المرور الحالية غير صحيحة'],
  ['current password',                   'أدخل كلمة المرور الحالية'],
  ['enter the new password',             'أدخل كلمة المرور الجديدة'],
  ['password must be at least',          'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وصغير ورقم'],
  ['confirmation incorrect',             'تأكيد كلمة المرور غير مطابق'],
  ['confirmation is required',           'تأكيد كلمة المرور مطلوب'],
  ['confimation is required',            'تأكيد كلمة المرور مطلوب'],
  ['confirm password is required',       'تأكيد كلمة المرور مطلوب'],
  ['password is required',               'كلمة المرور مطلوبة'],
  ['invalid email format',               'صيغة البريد الإلكتروني غير صحيحة'],
  ['email is required',                  'البريد الإلكتروني مطلوب'],
  ['email already',                      'البريد الإلكتروني مستخدم بالفعل'],
  ['no account found',                   'لا يوجد حساب بهذا البريد الإلكتروني'],
  ['no user with email',                 'لا يوجد حساب بهذا البريد الإلكتروني'],
  ['no user with this email',            'لا يوجد حساب بهذا البريد الإلكتروني'],
  ['no user for this id',                'المستخدم غير موجود'],
  ['reset code invalid',                 'رمز إعادة التعيين غير صحيح أو منتهي الصلاحية'],
  ['reset password not verified',        'لم يتم التحقق من إعادة تعيين كلمة المرور'],
  ['error in sending email',             'حدث خطأ أثناء إرسال البريد الإلكتروني'],
  ['admin account already exists',       'حساب المدير موجود بالفعل'],
  ['invalid setup key',                  'مفتاح الإعداد غير صحيح'],
  ['provide the account email',          'من فضلك أدخل البريد الإلكتروني'],

  // ── Permissions ───────────────────────────────────────
  ['not allowed to access this route',   'غير مصرح لك بالوصول لهذه الصفحة'],
  ['not allowed to access this media',   'غير مصرح لك بالوصول لهذه الوسائط'],
  ['not allowed to access this report',  'غير مصرح لك بالوصول لهذا التقرير'],
  ['not allowed to access this player',  'غير مصرح لك بالوصول لبيانات هذا اللاعب'],
  ['not allowed to update this player',  'غير مصرح لك بتعديل بيانات هذا اللاعب'],
  ['not allowed',                        'غير مصرح لك بهذه العملية'],
  ['does not belong to this player',     'هذه البيانات لا تخص هذا اللاعب'],
  ['not belong',                         'هذه البيانات ليست خاصة بك'],

  // ── Players ───────────────────────────────────────────
  ['player not found',                   'اللاعب غير موجود'],
  ['no player found',                    'اللاعب غير موجود'],
  ['birth year must be between',         'سنة ميلاد اللاعب يجب أن تكون بين 2009 و 2019'],
  ['no age group is configured',         'لا توجد فئة عمرية لسنة الميلاد دي، برجاء التواصل مع المدير'],
  ['agegroup not found',                 'لا توجد فئة عمرية لسنة الميلاد دي'],
  ['city of the player is required',     'مدينة اللاعب مطلوبة'],
  ['address is required',                'العنوان مطلوب'],
  ['date of birth is required',          'تاريخ الميلاد مطلوب'],
  ['invalid date format',                'صيغة التاريخ غير صحيحة'],
  ['team the player plays for',          'أدخل الفريق الذي يلعب له اللاعب'],
  ['team must be less than',             'اسم الفريق يجب أن يكون أقل من 100 حرف'],
  ['preferd foot',                       'أدخل القدم المفضلة للاعب (يمين - يسار)'],
  ['preferredfoot must be',              'القدم المفضلة يجب أن تكون: يمين، يسار، أو كلاهما'],
  ['enter the position',                 'أدخل مركز اللاعب'],
  ['invalid position',                   'مركز اللاعب غير صحيح'],
  ['phone number',                       'رقم هاتف مصري غير صحيح'],
  ['egyptian phone',                     'رقم هاتف مصري غير صحيح'],
  ['height must be a number',            'الطول يجب أن يكون رقماً'],
  ['weight must be a number',            'الوزن يجب أن يكون رقماً'],
  ['name is too short',                  'الاسم قصير جداً'],
  ['name is too long',                   'الاسم طويل جداً'],
  ['name is required',                   'الاسم مطلوب'],
  ['status cannot be set',               'لا يمكن تعيين الحالة يدوياً'],
  ['status cannot be updated',           'لا يمكن تعديل الحالة يدوياً'],
  ['status is required',                 'الحالة مطلوبة'],
  ['invalid status',                     'حالة غير صحيحة'],
  ['selected observer is not valid',     'المتابِع المختار غير صالح'],
  ['choose an observer',                 'من فضلك اختر متابعًا لهذا اللاعب'],
  ['invalid observer id',                'معرّف المتابِع غير صحيح'],
  ['invalid nationality',                'الجنسية غير صحيحة'],
  ['keyword must be a string',           'كلمة البحث غير صحيحة'],
  ['keyword too long',                   'كلمة البحث طويلة جداً'],

  // ── Scouting reports ──────────────────────────────────
  ['scouting report not found',          'التقرير غير موجود'],
  ['no reports found for this player',   'لا توجد تقارير لهذا اللاعب'],
  ['hometeam is required',               'اسم الفريق المضيف مطلوب'],
  ['awayteam is required',               'اسم الفريق الضيف مطلوب'],
  ['hometeam must be',                   'اسم الفريق المضيف غير صحيح'],
  ['awayteam must be',                   'اسم الفريق الضيف غير صحيح'],
  ['notes must be',                      'الملاحظات يجب أن تكون أقل من 1000 حرف'],
  ['must be a number between 1 and 10',  'التقييم يجب أن يكون رقماً بين 1 و 10'],
  ['matchdate cannot be set',            'لا يمكن تعيين تاريخ المباراة يدوياً'],
  ['cannot be set manually',             'لا يمكن تعيين هذا الحقل يدوياً'],
  ['already reported',                   'يوجد تقرير لهذا اللاعب في نفس التاريخ'],
  ['cannot attend a cancelled match',    'مينفعش تحضر ماتش اتلغى'],
  ['attendance can only be registered before the match day', 'التسجيل للحضور بيتقفل بمجرد ما يوم الماتش يجي — كان لازم تسجّل قبلها بيوم على الأقل'],
  ['attendance can only be cancelled before the match day',  'إلغاء الحضور بيتقفل بمجرد ما يوم الماتش يجي'],

  // ── Age groups ────────────────────────────────────────
  ['birth year is required',             'سنة الميلاد مطلوبة'],
  ['birth year already exists',          'سنة الميلاد دي موجودة بالفعل'],
  ['name already exists',                'الاسم موجود بالفعل'],

  // ── Media ─────────────────────────────────────────────
  ['already been uploaded',              'الفيديو ده اترفع قبل كده لنفس اللاعب'],
  ['media not found',                    'الوسائط غير موجودة'],
  ['media id is required',               'معرّف الوسائط مطلوب'],
  ['invalid media',                      'معرّف الوسائط غير صحيح'],
  ['title must not exceed',              'العنوان يجب ألا يتجاوز 100 حرف'],
  ['description must not exceed',         'الوصف يجب ألا يتجاوز 500 حرف'],
  ['provide an image',                   'من فضلك اختر ملف صورة'],
  ['file too large',                     'حجم الملف كبير جداً'],
  ['required when no match is linked',   'مفيش ماتش نربط الفيديو ده بيه — لازم تدخل عنوان ووصف'],
  ['linkedvideo is required',            'الصورة لازم ترفع مع فيديو'],
  ['no video for this linkedvideo',      'الفيديو المرتبط غير صحيح'],
  ['linkedvideo must belong to the same', 'الصورة دي لازم تترفع مع فيديو نفس اللاعب ونفس اللي رفعها'],
  ['at most 2 linked images',            'الفيديو مينفعش يتربط بيه أكتر من صورتين'],

  // ── Teams / coaches / dashboard ───────────────────────
  ['coach not found',                    'المدرب غير موجود'],
  ['not a coach',                        'هذا المستخدم ليس مدرباً'],
  ['team must belong to an agegroup',    'يجب أن ينتمي الفريق لفئة عمرية'],
  ['team should have coach',             'يجب أن يكون للفريق مدرب'],
  ['club name is required',              'اسم النادي مطلوب'],

  // ── Season matches ─────────────────────────────────────
  ['season must be in format',           'صيغة الموسم غير صحيحة، لازم تكون مثل 2025/2026'],
  ['season end year must be',            'سنة نهاية الموسم لازم تكون سنة البداية + 1'],
  ['season is required',                 'الموسم مطلوب'],
  ['season cannot be empty',             'الموسم مطلوب'],
  ['match date is required',             'تاريخ المباراة مطلوب'],
  ['match date cannot be in the past',   'تاريخ المباراة لازم يكون النهاردة أو بعده'],
  ['must belong to the match\'s age group', 'الفريق ده مش تابع لنفس الفئة العمرية بتاعت المباراة'],
  ['hometeam and awayteam must be different', 'الفريق المضيف والفريق الضيف لازم يكونوا مختلفين'],
  ['already scheduled on this date',     'فيه مباراة متسجلة بالفعل بين نفس الفريقين في نفس اليوم لنفس الفئة العمرية'],
  ['must swap home and away',            'الفريقين دول لعبوا قبل كده الموسم ده بنفس ترتيب الاستضافة — لازم مباراة العودة يتبادلوا فيها الاستضافة'],
  ['one or more attendees are not valid coaches or observers', 'واحد أو أكتر من الحاضرين المختارين مش كباتن أو كشافين صالحين'],
  ['one or more attendees are not valid coaches', 'واحد أو أكتر من الحاضرين المختارين مش كباتن صالحين'],
  ['attendees must be an array',         'قيمة الحاضرين غير صحيحة'],
  ['date has already passed and can no longer be modified', 'ميعاد المباراة عدى، معرفش تعدلها أو تمسحها'],
  ['venue must be a string',             'الملعب يجب أن يكون نص'],
  ['status cannot be set here',          'حالة المباراة بتتغير من شاشة تحديث الحالة بس'],
  ['result cannot be set here',          'نتيجة المباراة بتتغير من شاشة تحديث الحالة بس'],
  ['you can only enter the match result on the day of the match', 'مينفعش تسجل نتيجة المباراة إلا في يوم المباراة نفسه'],
  ['you are not assigned to attend this match', 'انت مش من الحاضرين المسجلين للمباراة دي'],
  ['no team for this id',                'الفريق غير موجود'],
  ['no age group for this id',           'الفئة العمرية غير موجودة'],

  // ── Evaluations ────────────────────────────────────────
  ['can no longer be edited',            'التقييم منشور بالفعل، مينفعش تعدّل عليه تاني'],
  ['to view other admins\' evaluations', 'لازم تنشر تقييمك الأول عن نفس المدرب ونفس الشهر عشان تقدر تشوف تقييمات الأدمنز التانيين'],
  ['to view the combined evaluation',    'لازم تنشر تقييمك الأول عن نفس المدرب ونفس الشهر عشان تقدر تشوف التقييم الكلي'],

  // ── Generic / server ──────────────────────────────────
  ['provide at least one field',         'من فضلك أدخل بيانات للتعديل'],
  ['provide valid data',                 'من فضلك أدخل بيانات صحيحة للتعديل'],
  ['invalid input data',                 'بيانات غير صحيحة، راجع المدخلات'],
  ['invalid request payload',            'البيانات المرسلة غير صالحة'],
  ['duplicate key',                      'البيانات دي موجودة بالفعل'],
  ['already exist',                      'البيانات دي موجودة بالفعل'],
  ['cast to objectid',                   'المعرّف (ID) غير صحيح'],
  ['invalid value',                      'قيمة غير صحيحة في أحد الحقول'],
  ['no document found',                  'البيانات المطلوبة غير موجودة'],
  ['no model for this id',               'البيانات المطلوبة غير موجودة'],
  ['invalid',                            'قيمة غير صحيحة في أحد الحقول'], // catch remaining "Invalid X Id"
  ['not found',                          'البيانات المطلوبة غير موجودة'],
  ['is required',                        'من فضلك املأ الحقول المطلوبة'],
  ['something went wrong',               'حدث خطأ في السيرفر، حاول مرة أخرى'],
];

const STATUS_MAP: Record<number, string> = {
  400: 'في بيانات غير صحيحة، راجع المدخلات وحاول تاني',
  401: 'انتهت الجلسة، سجّل الدخول مرة أخرى',
  403: 'غير مصرح لك بهذه العملية',
  404: 'البيانات المطلوبة غير موجودة',
  409: 'البيانات دي موجودة بالفعل',
  413: 'حجم الملف كبير جداً',
  429: 'طلبات كتير أوي، استنى شوية وحاول تاني',
  500: 'حدث خطأ في السيرفر، حاول مرة أخرى',
  503: 'الخدمة غير متاحة حالياً، حاول لاحقاً',
};

// Detects text that is already Arabic (e.g. upload messages authored in Arabic)
const ARABIC_RE = /[؀-ۿ]/;

/**
 * Translate a raw backend message to Arabic.
 * Returns '' when the message is unmapped English, so the caller can fall back
 * to a status-based Arabic message (guaranteeing no English ever reaches the user).
 */
export function toArabic(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  for (const [key, ar] of MESSAGE_MAP) {
    if (lower.includes(key)) return ar;
  }
  if (ARABIC_RE.test(raw)) return raw; // already Arabic → keep as-is
  return '';
}

function extractMessage(err: HttpErrorResponse): string {
  const statusFallback = STATUS_MAP[err.status] ?? `حصل خطأ غير متوقع (${err.status})`;

  // express-validator: { errors: [{ msg, path, ... }] }
  const validatorErrors: any[] = err.error?.errors;
  if (Array.isArray(validatorErrors) && validatorErrors.length > 0) {
    const translated = validatorErrors
      .map(e => toArabic(e.msg ?? e.message ?? ''))
      .filter(Boolean);
    const unique = [...new Set(translated)];
    if (unique.length > 0) return unique.join('\n');
    return statusFallback;
  }

  // AppError / generic: { message: "..." }
  const raw: string =
    err.error?.message ||
    err.error?.error ||
    (typeof err.error === 'string' ? err.error : '');

  return toArabic(raw) || statusFallback;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // Skip 401 silently only for non-login endpoints (the auth service handles token refresh)
      if (err.status === 401 && !req.url.includes('/auth/login')) return throwError(() => err);
      toast.error(extractMessage(err));
      return throwError(() => err);
    })
  );
};
