// Backend/services/scope.js
//
// Stage 2 — طبقة النطاق المركزية لرول proScout (Constitution Principle IV).
// تعريف واحد لكل مورد، وكل مستهلك بيقرا منه. ممنوع أي شرط فلترة يدوي في
// controller أو route handler؛ لو الحالة مش متعبّر عنها هنا، الطبقة دي هي
// اللي تتوسّع.
//
// ═══════════════════════════════════════════════════════════════════════════
// القاعدة الحاملة: كل نطاق غير فاضي بيتلفّ في $and
// ═══════════════════════════════════════════════════════════════════════════
// شروط mongoose المتسلسلة بتتدمج بـ **آخر واحد يكسب عند تصادم المفتاح**، مش
// بـAND. و`league` هو مفتاح النطاق **و** فلتر مسموح للعميل في نفس الوقت
// (SEASON_MATCH_FILTERS و TEAM_FILTERS)، يعني نطاق غير ملفوف بيتكتب فوقه
// بـ?league=premier ويرجّع الدوري التاني كامل. مقيس على mongoose 9.7.2:
//
//   find({league:"professional"}).find({league:"premier"})
//     → {"league":"premier"}                                  ← تسريب
//   find({$and:[{league:"professional"}]}).find({league:"premier"})
//     → {"$and":[{"league":"professional"}], "league":"premier"}  ← صفر نتايج ✅
//
// $and مش موجود في أي وايت ليست، فمفيش مفتاح من العميل يقدر يتصادم معاه،
// وطبقات $and بتتراص مش بتستبدل بعضها. الرولات القائمة بترجع {} عريان (مش
// { $and: [] } — دي غلطة في MongoDB أصلاً، وكمان بتكسر ضمانة "الاستعلام
// مطابق بايت ببايت" بتاعة Principle III).
//
// ملاحظة: الأسبقية المكتوبة في Principle IV (سكوب الملكية يتطبّق آخراً) اتحققت
// جوه ApiFeature.filter() بس. الـbaseFilterFn بيشتغل **الأول** في السلسلة،
// فالـ$and هو اللي بيرجّع الدلالة المقصودة من غير ما نلمس ApiFeature.
// ═══════════════════════════════════════════════════════════════════════════

import Team from "../models/teamModel.js";
import { ROLES } from "../constants/roles.js";

// فلتر مقفول — نفس الشكل المستخدم في apiFeatures.js
const MATCH_NOTHING = { _id: { $in: [] } };

const PROFESSIONAL = "professional";

// بيلفّ الشرط في $and. الشرط الفاضي بيرجع {} عريان.
const wrap = (condition) =>
    condition && Object.keys(condition).length ? { $and: [condition] } : {};

/**
 * ids كل فرق دوري المحترفين — **بما فيها المعطّلة (soft-deleted)**.
 *
 * ليه بما فيها المعطّلة: الفريق الممسوح ناعماً لسه عنده مستندات Player بتشاور
 * عليه. استبعاده بيخلّي لاعبينه يختفوا من قايمة الـproScout من غير ما يبقوا
 * خارج الدوري — ده فقدان بيانات صامت، مش مكسب أمني. وضمّهم مايقدرش يسرّب:
 * كل اللي بيوصله الفرع ده بيانات دوري محترفين بحكم البناء.
 *
 * ⚠️ لازم يفضل استعلام .distinct(). **أي** صيغة distinct بتتخطّى hook الحذف
 * الناعم (الـop بيبقى "distinct" وعمره ما بيطابق /^find/ — مقيس). يعني
 * bypassFilter تحت **توثيق نية، مش الآلية**. الخطر هو العكس: إعادة كتابتها
 * لأي صيغة بتفضل find (.select("_id") أو .lean() وكده) هتشغّل الـhook وتشيل
 * الفرق المعطّلة بصمت. اللي بيفرض ده فعلاً هو التست في
 * tests/roles/proScoutDataScope.test.js مش الأوبشن.
 *
 * الكاش على req بس — لكل طلب مرة واحدة. ممنوع كاش عابر للطلبات: المواصفة
 * بتطلب إن النطاق يعكس دوري الفريق **وقت الطلب**، مش قيمة محفوظة.
 */
export async function professionalTeamIds(req) {
    if (!req.__professionalTeamIds) {
        req.__professionalTeamIds = await Team.find({ league: PROFESSIONAL })
            .setOptions({ bypassFilter: true })
            .distinct("_id");
    }
    return req.__professionalTeamIds;
}

/**
 * نطاق اللاعبين — Stage 11 (specs/011-proscout-createdby-scope): createdBy فقط،
 * بلا استثناء. القرار القديم (Stage 2) كان بيضيف فرع "كل لاعبي فرق المحترفين"
 * فوق فرع createdBy — ده اتلغى بالكامل، مش وُسِّع: عضوية اللاعب في فريق دوري
 * محترفين معادش بتمنح أي proScout رؤية له وحدها. السبب: أي proScout كان يقدر
 * يشوف ويعدّل لاعبين proScout تاني بمجرد اشتراكهم في نفس الفريق — فجوة عزل
 * بيانات حقيقية، اتقفلت بقرار مالك صريح (constitution.md C-4، v1.1.0).
 *
 * لاعب بفريق دوري محترفين لكن createdBy بتاعه مش proScout (بيانات قبل هذه
 * المرحلة، أو استيراد أدمن، أو لاعب كوتش اتحول لفريق محترف) بيفضل مرئي للأدمن
 * بس — قرار مقصود، بلا migration أو backfill (specs/011، Option A).
 *
 * professionalTeamIds() ماعادتش تتنادى من هنا، لكنها لسه لازمة لـteamScopeFor
 * تحت ولـcheckTeamScope (التحقق وقت إنشاء/تعديل اللاعب) — الملغى هو استخدامها
 * في سكوب *قراءة* اللاعبين تحديداً، مش الدالة نفسها.
 */
export async function playerScopeFor(req) {
    // code-review high fix #2 — فشل مقفول لو req.user غايب (زي buildOwnerScope
    // بالظبط)، مش {} المفتوحة. مفيش نقطة استدعاء حالية بتوصل هنا من غير protect،
    // لكن الوحدة دي بتوثّق نفسها كمصدر الحقيقة الوحيد (Principle IV) — لازم
    // تحمي الغياب زي ما apiFeatures.js بيعمل بالظبط، دفاع في العمق.
    if (!req?.user) return { ...MATCH_NOTHING };
    if (req.user.role !== ROLES.PRO_SCOUT) return {};

    return wrap({ createdBy: req.user._id });
}

/**
 * نطاق المباريات. SeasonMatch.league حقل مباشر ومفهرس، فمفيش داعي لأي join
 * على الفرق.
 *
 * الأوبزيرفر مش هنا لأنه بقى بلا سكوب أصلاً — بيشوف الجدول كامل بالدورين زي
 * الكوتش/الأدمن بالظبط، فبيرجع من فرعهم في seasonMatchBaseFilterFor مباشرة
 * (`{}`)، لا من هنا. كان فيه فرع منفصل هنا بيقصره على مباريات فرق لاعبينه
 * المتابَعين فقط، اتلغى بالكامل عمداً — مش نُقل — عشان الأوبزيرفر يقدر يختار
 * ويحضر أي مباراة، مش يتقيد بفرق اللاعبين المعيَّن ليهم. الدالة دي بترجع {}
 * لأي رول غير proScout، والكنترولر هو اللي بيركّب الفرعين.
 */
export async function seasonMatchScopeFor(req) {
    // code-review high fix #2 — نفس معيار buildOwnerScope: غياب req.user يفشل مقفول.
    if (!req?.user) return { ...MATCH_NOTHING };
    if (req.user.role !== ROLES.PRO_SCOUT) return {};
    return wrap({ league: PROFESSIONAL });
}

/**
 * نطاق الفرق. ملاحظة اللاتماثل المقصود مع professionalTeamIds فوق:
 * ده بيمشي على gettingAll/ownership يعني op بتاعه find/findOne، فhook الحذف
 * الناعم **بيشتغل** والفرق المعطّلة بتتستبعد — زي كل الرولات التانية بالظبط.
 * يعني الـproScout ممكن يشوف لاعب في فريق محترفين متقاعد من غير ما يقدر يفتح
 * سجل الفريق نفسه. ده مقصود.
 */
export async function teamScopeFor(req) {
    // code-review high fix #2 — نفس معيار buildOwnerScope: غياب req.user يفشل مقفول.
    if (!req?.user) return { ...MATCH_NOTHING };
    if (req.user.role !== ROLES.PRO_SCOUT) return {};
    return wrap({ league: PROFESSIONAL });
}

export { MATCH_NOTHING, PROFESSIONAL };
