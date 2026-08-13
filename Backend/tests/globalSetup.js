import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;

export async function setup() {
  mongod = await MongoMemoryServer.create();
  process.env.TEST_MONGODB_URI = mongod.getUri();

  // Set all required env vars for the test process
  process.env.NODE_ENV              = 'test';
  process.env.JWT_SECRET_KEY        = 'test-jwt-secret-key-for-unit-tests-only-minimum-32-chars';
  process.env.JWT_REFRESH_SECRET    = 'test-refresh-secret-for-unit-tests-only-minimum-32-chars';
  process.env.JWT_EXPIRE_TIME       = '30m';
  process.env.JWT_REFRESH_EXPIRE_TIME = '7d';
  // ── Bunny (Stream + Storage) — test values only ──────────────────────────────
  process.env.BUNNY_STREAM_LIBRARY_ID     = '12345';
  process.env.BUNNY_STREAM_API_KEY        = 'test-stream-api-key';
  process.env.BUNNY_STREAM_TOKEN_AUTH_KEY = 'test-stream-token-auth-key';
  process.env.BUNNY_STREAM_CDN_HOSTNAME   = 'vz-test.b-cdn.net';
  process.env.BUNNY_STREAM_WEBHOOK_SECRET = 'test-webhook-secret';
  process.env.BUNNY_MAX_VIDEO_MB          = '1500';
  process.env.BUNNY_MAX_VIDEO_SECONDS     = '0';
  process.env.BUNNY_MAX_VIDEOS_PER_PLAYER_MATCH        = '5';
  process.env.BUNNY_MAX_FAILED_ATTEMPTS_PER_PLAYER_MATCH = '3';
  process.env.BUNNY_STORAGE_MEDIA_ZONE    = 'test-media-zone';
  process.env.BUNNY_STORAGE_MEDIA_API_KEY = 'test-media-storage-key';
  process.env.BUNNY_MEDIA_CDN_HOSTNAME    = 'test-media.b-cdn.net';
  process.env.BUNNY_MEDIA_TOKEN_AUTH_KEY  = 'test-media-token-auth-key';
  process.env.BUNNY_STORAGE_VAULT_ZONE    = 'test-vault-zone';
  process.env.BUNNY_STORAGE_VAULT_API_KEY = 'test-vault-storage-key';
  process.env.BUNNY_ACCOUNT_API_KEY       = 'test-account-api-key';
  process.env.CLIENT_URL            = 'http://localhost:4200';
  process.env.ADMIN_SETUP_KEY       = 'test-admin-key';
  process.env.EMAIL_USER            = 'test@test.com';
  process.env.EMAIL_PASS            = 'test-pass';
}

export async function teardown() {
  if (mongod) await mongod.stop();
}
