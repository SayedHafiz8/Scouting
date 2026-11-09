import { Server } from "socket.io";

import { authenticateSocket } from "./authenticateSocket.js";

let io;

const connectedUsers = new Map();

export const initSocket = (server) => {
    const isDev = process.env.NODE_ENV !== "production";

    if (isDev) console.log("SOCKET INITIALIZED");

  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"],
    },
  });

  // ✅ Socket Authentication Middleware — socket/authenticateSocket.js
  // (ملف لوحده عشان يكون قابل للاختبار؛ الشرح الكامل للإصلاحين هناك)
  io.use(authenticateSocket);



io.on("connection", (socket) => {
    const userId = socket.userId.toString();

    if (isDev) console.log(`Socket connected: ${userId}`);

    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }

    connectedUsers.get(userId).add(socket.id);

    socket.on("disconnect", () => {
      const userSockets = connectedUsers.get(userId);

      if (userSockets) {
        userSockets.delete(socket.id);

        if (userSockets.size === 0) {
          connectedUsers.delete(userId);
        }
      }

      if (isDev) console.log(`Socket disconnected: ${userId}`);
    });
  });

  return io;
};

export const getIO = () => io;

export const getConnectedUsers = () => connectedUsers;

// بيفصل كل سوكتس اليوزر ده فورًا. بيتستخدم من logout: المصادقة بتحصل مرة واحدة
// بس وقت المصافحة (authenticateSocket) وبعدها مابتتراجعش أبدًا، فاليوزر اللي
// سجّل خروج كان بيفضل مستقبل إشعارات وتحديثات لحد ما يقفل التبويبة.
//
// بيشتغل عادي لو السوكيت مش متشغّلة (تستات، سكريبتات) — بيرجع 0 من غير رمي.
export const disconnectUserSockets = (userId) => {
    if (!io) return 0;
    const socketIds = connectedUsers.get(String(userId));
    if (!socketIds?.size) return 0;

    // نسخة من الـids: socket.disconnect بيشغّل معالج "disconnect" اللي بيعدّل
    // نفس الـSet اللي بنلف عليه.
    let closed = 0;
    for (const id of [...socketIds]) {
        const socket = io.sockets.sockets.get(id);
        if (socket) {
            socket.disconnect(true);
            closed += 1;
        }
    }
    return closed;
};
