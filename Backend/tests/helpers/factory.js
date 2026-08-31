import request from 'supertest';
import bcrypt from 'bcryptjs';
import User from '../../models/userModel.js';
import AgeGroup from '../../models/ageGroupModel.js';
import Team from '../../models/teamModel.js';
import Player from '../../models/playedModel.js';
import SeasonMatch from '../../models/seasonMatchModel.js';
import app from '../../app.js';
import { currentYearMonthUTC } from '../../utils/time.js';

// Login only checks notEmpty (no format validation). Set-password endpoints require uppercase +
// lowercase + digit, min 8 chars, and now allow special characters (.{8,} instead of [A-Za-z\d]{8,}).
export const TEST_PASSWORD = 'TestPass1234';

// عدّاد تسلسلي للإيميلات الفريدة. `Date.now()` لوحده مكانش كافي: أي تست بيجمّد
// الساعة (vi.setSystemTime — زي تستات حدود الشهر في coachEvaluations) بيخلي كل
// المستخدمين في نفس التست ياخدوا نفس الإيميل → E11000 على email_1.
let userSeq = 0;
const uniqueEmail = (prefix) => `${prefix}_${Date.now()}_${++userSeq}@test.com`;

// Returns ISO date string for someone who is exactly `years` years old (birthday was yesterday)
export const dobForAge = (years) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

// ── Seed age groups for all valid birth years (2009 → 2019) ──────────────────
export async function seedAgeGroups() {
  const groups = Array.from({ length: 11 }, (_, i) => {
    const birthYear = 2009 + i;
    return { name: String(birthYear), birthYear };
  });
  await AgeGroup.insertMany(groups);
}

// ── Create an admin user directly in the DB and return token ─────────────────
export async function createAdmin(overrides = {}) {
  const email = overrides.email ?? uniqueEmail('admin');
  const admin = await User.create({
    name: 'Test Admin',
    email,
    password: TEST_PASSWORD,   // pre-save hook hashes it
    role: 'admin',
    ...overrides,
  });

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: admin.email, password: TEST_PASSWORD });

  return {
    user: admin,
    token: res.body.data?.accessToken,
    cookie: res.headers['set-cookie'],
  };
}

// ── Create a coach user and return token ─────────────────────────────────────
export async function createCoach(overrides = {}) {
  const email = overrides.email ?? uniqueEmail('coach');
  const coach = await User.create({
    name: 'Test Coach',
    email,
    password: TEST_PASSWORD,
    phoneNumber: '01012345678',
    role: 'coach',
    ...overrides,
  });

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: coach.email, password: TEST_PASSWORD });

  return {
    user: coach,
    token: res.body.data?.accessToken,
    cookie: res.headers['set-cookie'],
  };
}

// ── Create an observer user and return token ─────────────────────────────────
export async function createObserver(overrides = {}) {
  const email = overrides.email ?? uniqueEmail('observer');
  const observer = await User.create({
    name: 'Test Observer',
    email,
    password: TEST_PASSWORD,
    role: 'observer',
    ...overrides,
  });

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: observer.email, password: TEST_PASSWORD });

  return {
    user: observer,
    token: res.body.data?.accessToken,
    cookie: res.headers['set-cookie'],
  };
}

// ── Create a proScout user and return token ───────────────────────────────────
export async function createProScout(overrides = {}) {
  const email = overrides.email ?? uniqueEmail('proscout');
  const proScout = await User.create({
    name: 'Test Pro Scout',
    email,
    password: TEST_PASSWORD,
    role: 'proScout',
    ...overrides,
  });

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: proScout.email, password: TEST_PASSWORD });

  return {
    user: proScout,
    token: res.body.data?.accessToken,
    cookie: res.headers['set-cookie'],
  };
}

// ── Create a Team directly in the DB (requires an AgeGroup id) ────────────────
export async function createTeam(ageGroupId, overrides = {}) {
  return Team.create({
    name: overrides.name ?? `team_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ageGroup: ageGroupId,
    clubName: overrides.clubName ?? 'Test Club',
    ...overrides,
  });
}

// ── Base payload for a valid player (team is an optional Team ObjectId) ────────
export function playerPayload(overrides = {}) {
  return {
    name: 'Ahmed Ali',
    dateOfBirth: dobForAge(14),
    city: 'Cairo',
    address: '12 Test Street, Cairo',
    nationality: 'Egyptian',
    phoneNumber: '01098765432',
    position: 'CM',
    preferredFoot: 'right',
    height: 170,
    weight: 65,
    ...overrides,
  };
}

// ── Create a player via the API (requires age groups to be seeded) ────────────
export async function createPlayer(coachToken, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/players')
    .set('Authorization', `Bearer ${coachToken}`)
    .send(playerPayload(overrides));

  return res.body.data?.document;
}

// ── Create a player DIRECTLY in the DB, bypassing the API ─────────────────────
// Stage 2: the scope tests need players the HTTP path cannot produce —
// `createdBy` set to an arbitrary user (it is always the caller via POST
// /players), and players owned by a proScout at all (that role cannot create
// players until Stage 4). Team/coach/createdBy are all caller-controlled here.
//
// Age group is still derived by the pre('save') hook, so seedAgeGroups() must
// have run first, exactly as with the API path.
export async function createPlayerDoc(overrides = {}) {
  return Player.create({
    ...playerPayload(),
    ...overrides,
  });
}

// ── Two fresh Teams under the given AgeGroup — homeTeam/awayTeam are Team ObjectId refs ──
export async function defaultTeamIds(ageGroupId) {
  const home = await createTeam(ageGroupId);
  const away = await createTeam(ageGroupId);
  return { homeTeam: home._id.toString(), awayTeam: away._id.toString() };
}

// ── يظبط اللاعب على فريق ويعمله ماتش النهاردة (يستخدم لربط التقارير/الميديا بمباراة) ──
// matchDate اختياري — لو مبعوتش بيستخدم النهاردة، وده اللي بيخلي setupPlayerMatchDay reusable
// لحالات النافذة التانية (امبارح/بكرة/أقدم) من غير ما نكرر الدالة دي
// `options.attendedBy` (a user id) marks the match as attended + completed with a result —
// this is what makes it satisfy the video-upload gate's fuller "gated" condition
// (window + attendance + entered result), not just the date window alone.
export async function setupPlayerMatchDay(playerId, teamIds, matchDate, options = {}) {
  await Player.findByIdAndUpdate(playerId, { team: teamIds.homeTeam });

  const admin = await User.create({
    name: 'System',
    email: `system_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.com`,
    password: TEST_PASSWORD,
    role: 'admin',
  });

  const player = await Player.findById(playerId).select('ageGroup');
  const d = matchDate ?? new Date();
  const doc = {
    ageGroup: player.ageGroup,
    season: `${d.getFullYear()}/${d.getFullYear() + 1}`,
    matchDate: d,
    league: 'premier',
    homeTeam: teamIds.homeTeam,
    awayTeam: teamIds.awayTeam,
    createdBy: admin._id,
  };
  if (options.attendedBy) {
    doc.attendees = [options.attendedBy];
    doc.status = 'completed';
    doc.result = { homeScore: options.homeScore ?? 2, awayScore: options.awayScore ?? 1 };
  }
  return SeasonMatch.create(doc);
}

// ── Base payload for a valid scouting report (homeTeam/awayTeam must be Team ids) ────
export function reportPayload(overrides = {}) {
  return {
    // matchDate is set server-side to the creation date — not sent by the client
    notes: 'Excellent performance.',
    technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
    physical:  { speed: 9, stamina: 7, strength: 6, agility: 8 },
    mental:    { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
    ...overrides,
  };
}

// ── Base payload for a valid observer evaluation (pass `observer` id via overrides) ──
export function observerEvaluationPayload(overrides = {}) {
  return {
    ...currentYearMonthUTC(),
    scouting:        { talentIdentification: 8, matchAnalysis: 7, reportAccuracy: 9 },
    videoWork:       { videoRecordingQuality: 8, videoUploadTimeliness: 7, videoCoverage: 8 },
    professionalism: { punctuality: 9, commitment: 8, attitude: 7 },
    collaboration:   { communication: 8, reportTimeliness: 8 },
    notes: 'Solid month overall.',
    ...overrides,
  };
}

// ── Base payload for a valid coach evaluation (pass `coach` id via overrides) ──
//
// السنة/الشهر بييجوا من utils/time.js — **نفس** الدالة اللي الكونترولر بيقفل بيها.
// قبل كده الملف ده كان بيحسب UTC بنفسه والكونترولر بيقارن محلي، فالتستات كانت
// بتعدّي 27 يوم في الشهر وتفشل في نافذة حدود الشهر (اتقاست فعلاً: 2026-08-31 21:53Z).
export function coachEvaluationPayload(overrides = {}) {
  return {
    ...currentYearMonthUTC(),
    scouting:         { talentIdentification: 8, matchAnalysis: 7, reportAccuracy: 9 },
    videoWork:        { videoRecordingQuality: 8, videoUploadTimeliness: 7, videoCoverage: 8 },
    rosterManagement: { playerProfileQuality: 8, squadOrganization: 7 },
    professionalism:  { punctuality: 9, commitment: 8, matchAttendance: 7 },
    notes: 'Solid month overall.',
    ...overrides,
  };
}

// ── Create a scouting report via the API (auto-creates matching Teams unless given) ──
export async function createReport(coachToken, playerId, overrides = {}) {
  let teamIds = { homeTeam: overrides.homeTeam, awayTeam: overrides.awayTeam };
  if (!overrides.homeTeam || !overrides.awayTeam) {
    const player = await Player.findById(playerId).select('ageGroup');
    teamIds = await defaultTeamIds(player.ageGroup);
  }
  await setupPlayerMatchDay(playerId, teamIds);

  const res = await request(app)
    .post(`/api/v1/players/${playerId}/reports`)
    .set('Authorization', `Bearer ${coachToken}`)
    .send(reportPayload({ ...teamIds, ...overrides }));

  return res.body.data?.document;
}
