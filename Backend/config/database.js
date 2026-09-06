import mongoose from "mongoose";



const clientOptions = { serverApi: { version: '1', strict: false, deprecationErrors: true } };
export const dbConnection = async function run() {

    const isProduction = process.env.NODE_ENV === "production";
    const uli = process.env.CONNECTION_STRING;

    await mongoose.connect(uli, {
        ...clientOptions,
        autoIndex: !isProduction,  // في production الـ indexes تُنشأ مسبقاً وليس عند كل startup

        // perf audit 2026-09-04 — المجمّع كان بيبدأ فاضي (افتراضي minPoolSize: 0).
        // أي endpoint بيبعت استعلامات متوازية (مثلاً داشبورد الأوبزيرفر: 4 عدّات
        // في Promise.all) كان بيضطر يفتح اتصالات جديدة وقتها، وكل اتصال جديد =
        // TCP + TLS + مصادقة SCRAM ≈ 3-4 رحلات شبكة إضافية قبل أول بايت بيانات.
        //
        // مقيس على قاعدة الإنتاج الحقيقية، نفس الأربع عدّات، أربع تشغيلات متتالية:
        //   minPoolSize: 0  → 1139ms, 1134ms, 133ms, 149ms   (أول تشغيلتين بتدفعا الاتصالات)
        //   minPoolSize: 10 → 137ms, 100ms, 122ms, 135ms     (ثابتة عند رحلة واحدة)
        //
        // maxIdleTimeMS مطوّل عن الافتراضي عشان المجمّع ما يفضاش تاني أول ما
        // الترافيك يهدى — وده كان بيخلّي الحالة "الباردة" هي القاعدة مش الاستثناء
        // على موقع بترافيك متقطّع، فنفس الصفحة تطلع مرة 150ms ومرة 1.2 ثانية.
        minPoolSize: 10,
        maxIdleTimeMS: 300000,
    });

    await mongoose.connection.db.admin().command({ ping: 1 });

    if (!isProduction) {
        await mongoose.connection.syncIndexes();
    }

    console.log("Pinged your deployment. You successfully connected to MongoDB! ✅");
}
