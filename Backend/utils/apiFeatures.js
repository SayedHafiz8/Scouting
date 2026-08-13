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
                scope[baseKey] = value;
            }
        }
        return scope;
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
        if (this.user.role === "admin") return {};

        const field = ownerFields[this.user.role];
        if (!field) return { ...MATCH_NOTHING }; // دور مش معرّف في الماب — يشوف صفر

        return { [field]: this.user._id };
    }

    sort(){
        if(this.queryParams.sort){
            const sortBy = this.queryParams.sort.split(',').join(" ");
            this.query = this.query.sort(sortBy)
            
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
    paginate(countDocoments) {
        const page = Math.max(1, +this.queryParams.page || 1);
        // §10 — سقف على الـlimit اللي جاي من العميل. قبل كده ?limit=1000000 كان
        // بيتقبل كما هو: صفحة واحدة بتسحب الكولكشن كله. أخطرها /seasonMatches
        // اللي بيعمل populate رباعي إجباري لكل مستند، يعني ضرب في 4 على كل صف.
        // 200 = ضعف أعلى استخدام مشروع في الفرونت (my-matches بيطلب 100)، ومفيش
        // ولا dropdown بيبعت limit خالص — كلهم على الافتراضي 50 — فالسقف ده
        // مايقصّش أي قايمة حقيقية النهاردة.
        const requested = +this.queryParams.limit || ApiFeature.DEFAULT_LIMIT;
        const limit = Math.min(Math.max(1, requested), ApiFeature.MAX_LIMIT);
        const skip = (page -1) * limit;
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

        this.query = this.query.skip(skip).limit(limit);
        this.pagination = pagination;

        return this
    }
}

// ثابتين على الكلاس عشان يكونوا نقطة تعديل واحدة ويقدروا يتقروا من التستات
ApiFeature.DEFAULT_LIMIT = 50;
ApiFeature.MAX_LIMIT = 200;
// نفس السقف اللي في playerValidation. هنا عشان يغطي بحث التقارير والميديا كمان،
// اللي مالهمش validation chain على keyword أصلاً.
ApiFeature.MAX_KEYWORD_LENGTH = 50;


export default ApiFeature