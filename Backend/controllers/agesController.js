import asyncHandler from "express-async-handler";

import AgeGroup from "../models/ageGroupModel.js";
import { creating, gettingAll, gettingSpecific } from "../services/services.js";

// @desc    Create new AgeGroup
// @route   POST api/v1/ages
// @access  private
export const create = creating(AgeGroup);

// @desc    Get all age groups
// @route   POST api/v1/ages
// @access  private
// الترتيب دايمًا بالسنة تصاعديًا (ما لم العميل يطلب ترتيب تاني بنفسه) — عشان أي فئة جديدة تتحط في مكانها الصح تلقائيًا
// ملحوظة: في Express 5، req.query عبارة عن getter بيتحسب من جديد في كل مرة، فمجرد
// req.query.sort = "..." بيتعمل على نسخة مؤقتة وبيضيع أول ما حد تاني (زي ApiFeature) يقرأ req.query تاني.
// لازم نثبّت الـ property بـ defineProperty عشان التعديل يفضل موجود.
export const getAll = asyncHandler(async (req, res, next) => {
    if (!req.query.sort) {
        Object.defineProperty(req, "query", {
            value: { ...req.query, sort: "birthYear" },
            configurable: true,
            enumerable: true,
            writable: true,
        });
    }
    // الفرونت مبيبعتش أي param فلترة على /ages — sort شغّال عبر RESERVED_QUERY_KEYS
    // audit-database I2 — birthYear مفهرس (unique)، وهو القيمة الوحيدة اللي بتوصل
    // هنا أصلاً (الكونترولر بيفرضها فوق). name مضاف لأنه unique ومفهرس برضه.
    return gettingAll(AgeGroup, { sortable: ["birthYear", "name"] })(req, res, next);
});

// @desc    Get specific age 
// @route   POST api/v1/ages/:id
// @access  private
export const getSpecific = gettingSpecific(AgeGroup);