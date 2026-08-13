import express from "express";
import { getAll, create, getSpecific, deleting, update, setAgeIdToBody } from "../controllers/teamsController.js";
import { createValidate, deleteValidate, getAllValidate, getSpecificValidate, updateValidate } from "../utils/validation/teamValidation.js";
import { protect, allowedTo } from "../controllers/authController.js";
// (mergeParams) using for access parameters on other routers
const teamRouter = express.Router({mergeParams: true});

// ملحوظة: /teams/:id/players اتشال — mount ميت (Team id مالوش أي معنى كـcoach id)،
// مفيش استخدام في الفرونت ولا في أي تست ولا موثّق في openapi.json. راجع خطة B1+B2.

// §10 — القراءة بقت وراء protect. الداتا نفسها مش سرّية، بس مكانش فيه أي سبب
// تتعرض لغير المسجّلين: الفرونت بيناديها من صفحات محمية بس، والـvirtual بتاع
// players لو اتعمله populate يوم من الأيام كان هيسرّب أسامي لاعبين قاصرين من غير
// أي فحص. مفيش allowedTo — التلات أدوار بيحتاجوا الفرق (dropdowns + عرض).
// ملحوظة: ده بيغطي كمان الـmount المتداخل /ages/:id/teams. راوتات /ages نفسها
// بتفضل عامة عن قصد (security: [] موثّقة في الـswagger بتاعها).
teamRouter.route('/')
            .get(protect, getAll)
            .post(protect, allowedTo("admin"), setAgeIdToBody, createValidate, create)


teamRouter.route('/:id')
            .get(protect, getSpecificValidate, getSpecific)
            .patch(protect, allowedTo("admin"), updateValidate, update)
            .delete(protect, allowedTo("admin"), deleteValidate, deleting)


export default teamRouter;