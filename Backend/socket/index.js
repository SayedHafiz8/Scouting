import { Server } from "socket.io";
import jwt from "jsonwebtoken";

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

  // ✅ Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
        const token =
            socket.handshake.auth.token ||
            socket.handshake.query.token;

        if (!token) {
            return next(new Error("Unauthorized"));
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET_KEY
        );

        socket.userId = decoded.userId;

        next();

    } catch (err) {
        next(new Error("Unauthorized"));
    }
});



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
