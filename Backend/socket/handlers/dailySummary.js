import cron from "node-cron";
import Player from "../../models/playedModel.js";
import Config from "../../models/configModel.js";
import { sendNotificationToAdmins } from "./notification.js";

const LAST_SENT_KEY = "dailySummaryLastSentAt";

export const startDailySummary = () => {
    // يعمل مرة واحدة يومياً عند منتصف الليل
    cron.schedule("0 0 * * *", async () => {
        try {
            // قراءة lastSentAt من DB — يبقى محفوظ بعد أي server restart
            const config = await Config.findOne({ key: LAST_SENT_KEY }).lean();
            const lastSentAt = config?.value
                ? new Date(config.value)
                : new Date(); // أول تشغيل: ابدأ من الآن (لا ترسل كل اللاعبين التاريخيين)

            const summary = await Player.aggregate([
                {
                    $match: {
                        createdAt: { $gt: lastSentAt },
                    },
                },
                {
                    $group: {
                        _id: "$coach",
                        count: { $sum: 1 },
                        players: {
                            $push: {
                                name: "$name",
                                position: "$position",
                            },
                        },
                    },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "_id",
                        foreignField: "_id",
                        as: "coach",
                    },
                },
                {
                    $unwind: "$coach",
                },
                {
                    $project: {
                        _id: 0,
                        coachName: "$coach.name",
                        count: 1,
                        players: 1,
                    },
                },
            ]);

            // لو مفيش لاعبين جدد — متبعتش حاجة ومتحدثش lastSentAt
            if (!summary.length) return;

            const totalPlayers = summary.reduce((acc, s) => acc + s.count, 0);

            await sendNotificationToAdmins({
                type: "DAILY_SUMMARY",
                message: `تم إضافة ${totalPlayers} لاعب جديد`,
                details: summary.map((s) => ({
                    coach: s.coachName,
                    count: s.count,
                    players: s.players,
                })),
                createdAt: new Date(),
            });

            // حفظ lastSentAt في DB بعد الإرسال الناجح
            await Config.findOneAndUpdate(
                { key: LAST_SENT_KEY },
                { $set: { value: new Date() } },
                { upsert: true }
            );
        } catch (error) {
            console.error("Daily summary error:", error);
            // lastSentAt لا يُحدَّث عند الخطأ — الـ run القادم يُعيد المحاولة
        }
    });
};
