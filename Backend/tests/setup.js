import { vi, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// ── Mock external I/O before any module is imported ──────────────────────────
vi.mock('../utils/sendEmail.js', () => ({
  default: vi.fn().mockResolvedValue(true),
}));

// Bunny network wrappers are mocked per-test-file (keeping bunnyConfig real) so
// each test can control what the Stream/Storage API returns. No global mock here.

vi.mock('../socket/handlers/notification.js', () => ({
  sendNotificationToUser: vi.fn().mockResolvedValue(undefined),
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
  // §11 — بترجّع [] افتراضياً: مفيش أدمن متصل في التستات، فـ
  // emitAdminDashboardUpdate بيخرج بدري زي ما كان بالظبط قبل التغيير.
  // tests/dashboardEmit.test.js بيعمل override محلي عشان يختبر الفرعين.
  getConnectedAdminIds: vi.fn().mockResolvedValue([]),
}));

vi.mock('../socket/index.js', () => ({
  getIO: vi.fn().mockReturnValue({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  }),
  getConnectedUsers: vi.fn().mockReturnValue(new Map()),
}));

// ── Database lifecycle ────────────────────────────────────────────────────────
beforeAll(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // §11 — كاش داشبورد الأدمن بيعيش في الذاكرة، فمسح الكولكشنز فوق مابيلمسهوش.
  // من غير السطر ده أي تست بيقرا /dashboard/admin كان هياخد أرقام التست اللي
  // قبله (نفس البروسيس، TTL 45 ثانية > مدة السويت كلها).
  const { __resetDashboardCache } = await import('../controllers/dashboardController.js');
  __resetDashboardCache();
});
