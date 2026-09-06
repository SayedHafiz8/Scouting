import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../app.js";
import {
  seedAgeGroups,
  createAdmin,
  createCoach,
  TEST_PASSWORD,
} from "./helpers/factory.js";

// ============================================================================
// perf audit 2026-09-04 — ضغط الردود.
//
// الملف ده بيقفل قرارين مع بعض: إن الضغط شغال فعلاً على الردود الكبيرة، وإن
// مسارات /auth **مستثناة منه بالكامل** — والتاني ده هو الجزء الأمني.
//
// السبب: هجمات فئة BREACH/CRIME بتستنتج سر جوه جسم الرد عن طريق قياس **حجم**
// الرد المضغوط لما يكون جنب السر مُدخل بيتحكّم فيه المهاجم. ردود /auth هي
// الوحيدة اللي بتحمل access token في الجسم، فاتشالت من المعادلة من أصلها بدل
// الاعتماد على تحليل "فيه انعكاس مدخلات هنا ولا لأ" لكل مسار لوحده — تحليل
// بيبطل صحته أول ما حد يضيف حقل في رد مستقبلي.
//
// التست ده هو الحارس: لو حد شال الـfilter من compression() في app.js عن طريق
// الخطأ، الحالة الأولى تحت هتقع.
// ============================================================================

describe("response compression", () => {
  beforeEach(async () => {
    await seedAgeGroups();
  });

  it("never compresses /auth responses, even when the client asks for gzip", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Accept-Encoding", "gzip, deflate, br")
      .send({ email: admin.user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    // الرد ده بيحمل access token في الجسم — لازم يفضل غير مضغوط مهما كان حجمه
    expect(res.body.data?.accessToken).toBeTruthy();
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("does not compress the refreshToken response either", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post("/api/v1/auth/refreshToken")
      .set("Accept-Encoding", "gzip, deflate, br")
      .set("Cookie", admin.cookie);

    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("compresses a large list response when the client asks for gzip", async () => {
    const coach = await createCoach();

    // ردود كبيرة كفاية تعدّي عتبة الضغط الافتراضية (1KB): بنعمل فرق كتير
    // عشان /teams يرجّع جسم محترم بدل ما نعتمد على بيانات موجودة صدفة.
    const AgeGroup = (await import("../models/ageGroupModel.js")).default;
    const Team = (await import("../models/teamModel.js")).default;
    const group = await AgeGroup.findOne({ birthYear: 2012 });
    await Team.insertMany(
      Array.from({ length: 40 }, (_, i) => ({
        name: `Compression Test Club Number ${i}`,
        clubName: `A reasonably long club name for padding ${i}`,
        ageGroup: group._id,
        league: "premier",
      }))
    );

    const res = await request(app)
      .get("/api/v1/teams?limit=50")
      .set("Accept-Encoding", "gzip")
      .set("Authorization", `Bearer ${coach.token}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  it("still returns correct, complete data when compressed", async () => {
    const coach = await createCoach();
    const AgeGroup = (await import("../models/ageGroupModel.js")).default;
    const Team = (await import("../models/teamModel.js")).default;
    const group = await AgeGroup.findOne({ birthYear: 2012 });
    await Team.insertMany(
      Array.from({ length: 40 }, (_, i) => ({
        name: `Roundtrip Club ${i}`,
        clubName: `Padding club name to clear the compression threshold ${i}`,
        ageGroup: group._id,
        league: "premier",
      }))
    );

    const res = await request(app)
      .get("/api/v1/teams?limit=50")
      .set("Accept-Encoding", "gzip")
      .set("Authorization", `Bearer ${coach.token}`);

    // supertest بيفكّ الضغط لوحده — فالتأكيد ده بيثبت إن الجسم سليم بعد الفك،
    // مش بس إن الهيدر موجود.
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.body.data.documents.length).toBe(40);
    // اسم الفريق بيتخزّن lowercase من الموديل نفسه — بنقارن بالشكل ده مش بالمدخل
    expect(res.body.data.documents[0].name).toContain("roundtrip club");
  });
});
