import { ROLES } from "../constants/roles.js";

// query params اللي بتستهلكها مراحل تانية (pagination/sort/fields/search) — أبداً مش فلاتر
const RESERVED_QUERY_KEYS = ['page', 'limit', 'sort', 'fields', 'keyword'];

// فلتر مقفول (فشل مقفول) — بيستخدم لما نضمن إن الاستعلام يرجّع صفر نتايج
const MATCH_NOTHING = { _id: { $in: [] } };

class ApiFeature {
    constructor(query, queryParams,params, user = null){
        this.query = query;
        this.queryParams = queryParams ?? {};
        this.params = params ?? {};
        this.user = user;
    }

    /**
     * @param {object} options
     * @param {string|null} options.parentField
     *        الحقل اللي بيتقارن بـ :id بتاع الراوت الأب (Player.coach تحت /users/:id/players،
     *        Team.ageGroup تحت /ages/:id/teams). null = القائمة دي مش بتتحط تحت أب أبداً.
     * @param {object|null} options.ownerFields
     *        { <role>: <schema path> } — وجودها هو الإعلان إن المجموعة دي "مملوكة" (owner-scoped):
     *        دور مش موجود في الماب، أو طلب من غير user، بيشوف صفر نتايج.
     *        غيابها = داتا مرجعية مشتركة (Team/AgeGroup/SeasonMatch) — مفيش فلتر ملكية أبداً.
     * @param {string[]} options.allowed
     *        وايت ليست لمفاتيح الـquery المسموحة (بعد شيل عملية المقارنة [gte]/[gt]/[lte]/[lt]).
     *        دفاع إضافي بس — العزل مش معتمد عليها، الملكية بتتحط آخر حاجة دايماً.
     */
    filter({ parentField = null, ownerFields = null, allowed = [] } = {}){
        const queryScope = this.buildQueryScope(allowed);
        const parentScope = this.buildParentScope(parentField);
        const ownerScope = this.buildOwnerScope(ownerFields);

        // الأسبقية: query العميل < param المسار < سكوب الملكية.
        // الملكية بتتحط آخر حاجة — مفيش مدخل من العميل يقدر يوسّعها أو يحوّلها.
        this.query = this.query.find({ ...queryScope, ...parentScope, ...ownerScope });
        return this;
    }

    // convert field[gte]=value to {field: {$gte: value}} — وبيرفض أي مفتاح مش في الوايت ليست
    buildQueryScope(allowed){
        const allowSet = new Set(allowed);
        const queryObj = { ...this.queryParams };
        RESERVED_QUERY_KEYS.forEach((field) => delete queryObj[field]);

        const scope = {};
        for (const key in queryObj){
            const value = queryObj[key];
            const match = key.match(/^(.*)\[(gte|gt|lte|lt)\]$/);
            // نشيل عملية المقارنة الأول — الفحص لازم يكون على الحقل الأساسي، وإلا
            // matchDate[gte] محتاج بند وايت ليست منفصل عن matchDate[lte] وهكذا
            const baseKey = match ? match[1] : key;

            if (!allowSet.has(baseKey)) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn(`ApiFeature: dropped non-whitelisted query key "${key}" for ${this.query.model.modelName}`);
                }
                continue;
            }

            if (match){
                const operator = `$${match[2]}`;
                if(!scope[baseKey]){
                    scope[baseKey] = {};
                }
                scope[baseKey][operator] = value;
            }else{
                scope[baseKey] = this.normalizeBooleanFalse(baseKey, value);
            }
        }
        return scope;
    }

    /**
     * audit-database M1 — الحقل البولياني الغايب لازم يتعامل كـfalse.
     *
     * MongoDB بيفرّق بين "الحقل قيمته false" و"الحقل مش موجود"، و{field: false}
     * بيطابق الأولانية بس. ودي مشكلة حقيقية مع أي حقل بولياني بيتضاف لمخطط فيه
     * مستندات قديمة: `default: false` بيتكتب على المستندات **الجديدة** بس، والقديمة
     * بيفضل الحقل غايب عندها تماماً.
     *
     * الحالة اللي كشفت ده: Player.isProfessional (المرحلة 4b) واتفتح كفلتر أدمن في
     * المرحلة 4c. مُثبَت بالتنفيذ على لاعبين — واحد قديم بلا الحقل وواحد بالكود
     * الحالي:
     *     ?isProfessional=false  بيطابق 1 من 2   ← بيسقط المستند القديم
     *     { $ne: true }          بيطابق 2 من 2   ← الصح
     * يعني الأدمن بيفلتر "الناشئين بس" وبياخد قايمة ناقصة **بصمت**: مفيش خطأ،
     * والعدّاد نفسه بيقول رقم متّسق مع القايمة الناقصة (getCountsByAgeGroup بتستخدم
     * $cond اللي بتعامل الغايب كـfalsy صح)، فالغلط مش قابل للاكتشاف من الواجهة.
     *
     * الإصلاح هنا **عام مش خاص بـisProfessional**: أي حقل بولياني في أي مخطط
     * بياخد نفس المعاملة تلقائياً، عشان الحقل البولياني الجاي مايكررش نفس الفخ.
     * وscripts/backfillIsProfessional.js بيصلّح البيانات نفسها — الاتنين مطلوبين:
     * الـbackfill بيصلّح النهاردة، والدلالة دي بتصلّح بكرة.
     *
     * ملاحظة: القيمة جاية من الـquery string فهي **نص** ("false")، مش بوليان.
     */
    normalizeBooleanFalse(field, value){
        const path = this.query.model.schema.path(field);
        if (!path || path.instance !== 'Boolean') return value;

        // نفس القيم اللي mongoose نفسه بيحوّلها لـfalse وقت الـcast
        const isFalse = value === false || value === 'false' || value === '0' || value === 0;
        return isFalse ? { $ne: true } : value;
    }

    buildParentScope(parentField){
        if (!parentField) return {};
        const path = this.query.model.schema.path(parentField);
        if (!path || !path.options.ref) return {};

        const paramId = this.params.id;
        return paramId ? { [parentField]: paramId } : {};
    }

    buildOwnerScope(ownerFields){
        if (!ownerFields) return {}; // داتا مرجعية مشتركة — مفيش سكوب ملكية أصلاً
        if (!this.user) return { ...MATCH_NOTHING }; // قائمة مملوكة على راوت من غير protect
        if (this.user.role === ROLES.ADMIN) return {};

        // Stage 2 — التفرقة بين "الدور مش موجود في الماب" و"موجود بقيمة null".
        //
        // غايب  → MATCH_NOTHING زي ما كان بالظبط. ده هو ضمان المنع-بالافتراض
        //          (Principle II) وماتمسّش: أي رول جديد يتضاف للـenum من غير ما
        //          حد يفكّر في نطاقه بيشوف صفر.
        // null   → إعلان صريح إن الدور ده متسكوب من **طبقة تانية** (baseFilterFn
        //          أو فلتر أساسي في الكنترولر)، فمفيش سكوب ملكية يتحط هنا.
        //          محتاجينه لأن سكوب proScout شكله $or مركّب على حقلين، وده مش
        //          قابل للتعبير بـ{ [field]: user._id }.
        //
        // ليه لازم يكون {} مش MATCH_NOTHING: الاتنين بيتدمجوا بـAND، و
        // MATCH_NOTHING ∧ أي حاجة = صفر دايماً. يعني سيبان الدور غايب "كطبقة
        // حماية إضافية" مع سكوب أساسي مش دفاع في العمق — هو منع كامل ونهائي
        // للـendpoint. (الافتراض ده كان مكتوب في research R1 وطلع غلط عند التنفيذ.)
        const hasRole = Object.prototype.hasOwnProperty.call(ownerFields, this.user.role);
        if (!hasRole) return { ...MATCH_NOTHING }; // دور مش معرّف في الماب — يشوف صفر

        const field = ownerFields[this.user.role];
        if (!field) return {}; // معرّف صراحةً كـnull — النطاق جاي من الطبقة الأساسية

        return { [field]: this.user._id };
    }

    /**
     * audit-database I2 — وايت ليست لحقول الترتيب، بنفس نمط `allowed` في filter().
     *
     * قبل كده الدالة دي كانت **النقطة الوحيدة** من التلاتة اللي بتاخد مدخل من
     * العميل وبتعدّيه كما هو: filter() عندها وايت ليست وبترمي المفتاح المرفوض،
     * وsearchPrefix() عندها سقف طول وescape وحقل مطبّع واحد، وsort() كانت
     * بتاخد أي سلسلة وتحطها في .sort() مباشرة.
     *
     * الأثر مقيس بـexplain على mongodb-memory-server (limit=50 في كل الحالات):
     *   ?sort=overallRating على التقارير  → COLLSCAN، فحص 75,400 لـ50
     *   ?sort=title على الميديا           → COLLSCAN، فحص 50,000 لـ50
     *   ?sort=name/height/notes على اللاعبين → COLLSCAN، فحص 25,800 لـ50
     * يعني أي مستخدم مسجّل دخول كان يقدر يجبر مسحاً كاملاً على أكبر كولكشن في
     * النظام بـquery param واحد، ويكرّره بمعدل الـrate limiter. الـblocking sort
     * نفسه مش المشكلة (المحرك بيستخدم top-k مع الـlimit، والذاكرة المقيسة 25KB) —
     * التكلفة هي المسح.
     *
     * القاعدة: **الحقل المسموح لازم يكون مفهرس**. الوايت ليست مش تجميلية — لو
     * حقل اتضاف هنا وهو مش مفهرس، فهو نفس المشكلة باسم مسموح.
     *
     * السلوك مع المرفوض: بيتشال بصمت (زي filter() بالظبط) والباقي بيتنفّذ. الرفض
     * الصريح بـ400 كان هيكسر أي عميل قديم بيبعت ?sort=name، والمكسب الأمني صفر.
     *
     * @param {string[]} allowedSortFields أسماء الحقول المسموح الترتيب بيها.
     *        القايمة الفاضية (الافتراضي) = مفيش ترتيب من العميل خالص — الفشل
     *        المقفول، عشان أي مستدعي جديد ينسى يمرّر القايمة مايفتحش الباب تاني.
     */
    sort(allowedSortFields = []){
        if (!this.queryParams.sort) return this;

        const allowSet = new Set(allowedSortFields);
        const fields = String(this.queryParams.sort)
            .split(',')
            .map((field) => field.trim())
            .filter(Boolean)
            .filter((field) => {
                // الشرطة البادئة = ترتيب تنازلي، مش جزء من اسم الحقل
                const baseField = field.startsWith('-') ? field.slice(1) : field;
                if (allowSet.has(baseField)) return true;
                if (process.env.NODE_ENV !== 'production') {
                    console.warn(`ApiFeature: dropped non-whitelisted sort field "${field}" for ${this.query.model.modelName}`);
                }
                return false;
            });

        if (fields.length) {
            this.query = this.query.sort(fields.join(' '));
        }
        return this;
    }
    limitFields(){
        if(this.queryParams.fields){
            const fields = this.queryParams.fields.split(',').join(' ');
            this.query = this.query.select(fields);
        }else {
            this.query = this.query.select('-__v');
        }
        return this;
    }
    /**
     * §11 — بحث بالبادئة على حقل كلمات مطبّع (lowercase) ومفهرس.
     *
     * الشكل القديم كان $regex غير مربوط بأول الكلمة + $options:"i" على عدة حقول
     * جوه $or. ده مستحيل يستخدم index بحكم التصميم: الـregex الـcase-insensitive
     * مابياخدش حدود btree حتى مع ^، والـ$or على حقول غير مفهرسة بيرجّع الاستعلام
     * لـCOLLSCAN حتى لو حقل واحد منهم مفهرس. دليل explain على 5000 لاعب:
     * COLLSCAN بـ exam 230 → ret 20.
     *
     * الشكل الجديد: الكلمة بتتحوّل lowercase وبتتدوّر بـ^ على حقل مطبّع سلفاً
     * (Player.searchTokens) من غير الفلاج i — ده الشرط الوحيد اللي بياخد حدود
     * index حقيقية.
     *
     * تغيير سلوك مقصود: "Moh" بتلاقي "Mohamed" ✅، لكن "hamed" (جزء وسط) مابقتش
     * تلاقيها. الـtokens بتخلي "Salah" تلاقي "Mohamed Salah" لأن كل كلمة مدخل
     * مستقل في الـmultikey index.
     *
     * العزل: بنستخدم .find() فبيتراكب فوق الفلاتر السابقة بـAND. سكوب الملكية
     * اتحط قبل كده في filter() ومابيتلمسش — الكوتش وهو بيبحث بيفضل شايف لاعبيه
     * هو بس. (tests/isolation.test.js بيقفل ده.)
     */
    searchPrefix(tokenField) {
        if (!this.queryParams.keyword || !tokenField) {
            return this;
        }

        // السقف اتحافظ عليه من §10: بيمنع بناء regex بطول عشوائي من مدخل العميل
        const keyword = String(this.queryParams.keyword)
            .trim()
            .toLowerCase()
            .slice(0, ApiFeature.MAX_KEYWORD_LENGTH);
        if (!keyword) {
            return this;
        }

        // الـescape اتحافظ عليه من §10: من غيره العميل بيتحكم في نمط الـregex
        // نفسه وكلمة زي "(a+)+$" بتسبب catastrophic backtracking (ReDoS) اللي
        // بيعلّق الـevent loop بتاع Node كله.
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        this.query = this.query.find({
            [tokenField]: { $regex: `^${escaped}` },
        });
        return this;
    }
    // perf audit 2026-09-04 — paginate() اتقسمت لنصين عشان العدّ والجلب يقدروا
    // يشتغلوا بالتوازي. النصّ ده (skip/limit على الكويري) **مش محتاج العدد
    // أصلاً**: page وlimit بييجوا من queryParams بس، والعدد كان داخل قديماً
    // للبيانات الوصفية لا غير. فالترتيب الجديد: applyPagination() → نبعت
    // countDocuments والـfind مع بعض → buildPagination(count) لما العدد يوصل.
    //
    // الفلتر اللي بيروح للعدّ هو نفسه بالظبط بتاع الكويري (getFilter من نفس
    // الكويري) — التقسيمة دي مابتلمسش الفلترة ولا النطاق، بس التوقيت.
    applyPagination() {
        const page = Math.max(1, +this.queryParams.page || 1);
        // §10 — سقف على الـlimit اللي جاي من العميل. قبل كده ?limit=1000000 كان
        // بيتقبل كما هو: صفحة واحدة بتسحب الكولكشن كله. أخطرها /seasonMatches
        // اللي بيعمل populate رباعي إجباري لكل مستند، يعني ضرب في 4 على كل صف.
        // 200 = ضعف أعلى استخدام مشروع في الفرونت (my-matches بيطلب 100)، ومفيش
        // ولا dropdown بيبعت limit خالص — كلهم على الافتراضي 50 — فالسقف ده
        // مايقصّش أي قايمة حقيقية النهاردة.
        const requested = +this.queryParams.limit || ApiFeature.DEFAULT_LIMIT;
        const limit = Math.min(Math.max(1, requested), ApiFeature.MAX_LIMIT);
        const skip = (page - 1) * limit;

        this._page = page;
        this._limit = limit;
        this._skip = skip;

        this.query = this.query.skip(skip).limit(limit);

        return this;
    }

    // لازم تتنادى بعد applyPagination() — بتبني البيانات الوصفية بس، مابتلمسش الكويري.
    buildPagination(countDocoments) {
        const page = this._page;
        const limit = this._limit;
        const skip = this._skip;
        const endIndex = page * limit;

        const pagination = {};
        pagination.currentPage= page;
        pagination.limit = limit;
        pagination.numberOfPages = Math.ceil(countDocoments / limit)

        if(endIndex < countDocoments){
            pagination.next = page + 1;
        }
        if(skip > 0) {
            pagination.prev = page - 1;
        }

        this.pagination = pagination;

        return this
    }

    // الشكل القديم (عدّ ثم جلب بالتتابع) — متسايب زي ما هو عشان أي مستدعي
    // مايتغيرش سلوكه، ومستخدم في التستات اللي بتختبر الترقيم لوحده.
    paginate(countDocoments) {
        return this.applyPagination().buildPagination(countDocoments);
    }
}

// ثابتين على الكلاس عشان يكونوا نقطة تعديل واحدة ويقدروا يتقروا من التستات
ApiFeature.DEFAULT_LIMIT = 50;
ApiFeature.MAX_LIMIT = 200;
// نفس السقف اللي في playerValidation. هنا عشان يغطي بحث التقارير والميديا كمان،
// اللي مالهمش validation chain على keyword أصلاً.
ApiFeature.MAX_KEYWORD_LENGTH = 50;


export default ApiFeature