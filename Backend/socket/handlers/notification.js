import { getIO, getConnectedUsers } from "../index.js";
import User from "../../models/userModel.js";
import { ROLES } from "../../constants/roles.js";

// ✅ بعت notification لـ user معين
export const sendNotificationToUser = (userId, notification) => {

    const io = getIO();
    if (!io) return;

    const connectedUsers = getConnectedUsers();

    const sockets = connectedUsers.get(userId.toString());

    if (!sockets) return;

    sockets.forEach(socketId => {
        io.to(socketId).emit("notification", notification);
    });

};

// §11 — مين من الأدمنز متصل دلوقتي فعلاً (مصفوفة ids كنصوص).
//
// الـsocket layer بيخزّن userId بس مش الدور (socket/index.js:36 — والـJWT نفسه
// مافيهوش role عن قصد: توكن بيحمل صلاحية مش بتتحقق من الداتابيز بيفضل صالح بعد
// ما الدور يتغيّر). فالطريقة الوحيدة إننا نقاطع قايمة المتصلين مع الأدمنز.
//
// استعلام واحد رخيص على index الـrole. المستدعي بيقدر يستخدم الناتج عشان يقرر
// إذا كان يستاهل يشتغل أصلاً، وبعدين يمرّره لـsendNotificationToAdmins فمابيتنفذش
// نفس الاستعلام مرتين.
export const getConnectedAdminIds = async () => {
    const connectedUsers = getConnectedUsers();
    if (!getIO() || connectedUsers.size === 0) return [];

    // lean() أسرع لأننا محتاجين _id بس بدون Mongoose document overhead
    const admins = await User
        .find({ role: ROLES.ADMIN })
        .select("_id")
        .lean();

    return admins
        .map((a) => a._id.toString())
        .filter((id) => connectedUsers.has(id));
};

// ✅ بعت notification لكل الـ admins
// adminIds اختياري: لو المستدعي جابهم بالفعل من getConnectedAdminIds بنستخدمهم
// بدل ما نعيد الاستعلام. لو مش متبعتين بنجيبهم هنا (السلوك القديم بالظبط).
export const sendNotificationToAdmins = async (notification, adminIds = null) => {

    const io = getIO();
    const connectedUsers = getConnectedUsers();

    // early return لو مفيش حد متصل خالص — بنتجنب DB query
    if (!io || connectedUsers.size === 0) return;

    const targets = adminIds ?? (await getConnectedAdminIds());

    targets.forEach((adminId) => {

        const sockets = connectedUsers.get(adminId);

        if (!sockets) return;

        sockets.forEach(socketId => {
            io.to(socketId).emit(
                "notification",
                notification
            );
        });
    });
};