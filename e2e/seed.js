// Seeds the E2E coach account via the admin API.
// Signup is disabled in this app — coaches are created by admins only.
// Run after the backend is up (health check passed) and seedAdmin() has run.
// Idempotent: exits 0 if the coach email already exists.

const API    = process.env.E2E_API_URL    ?? 'http://localhost:3000/api/v1';
const aEmail = process.env.ADMIN_EMAIL;
const aPass  = process.env.ADMIN_PASSWORD;
const cEmail = process.env.E2E_COACH_EMAIL;
const cPass  = process.env.E2E_COACH_PASSWORD;
const pEmail = process.env.E2E_PROSCOUT_EMAIL;
const pPass  = process.env.E2E_PROSCOUT_PASSWORD;

async function run() {
  // 1. Log in as admin to get a bearer token
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: aEmail, password: aPass }),
  });
  if (!loginRes.ok) {
    throw new Error(`Admin login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const { data: { accessToken } } = await loginRes.json();
  console.log('Admin login OK');

  // 2. Create the coach account via the admin-only POST /users endpoint
  const createRes = await fetch(`${API}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name:            'E2E Coach',
      email:           cEmail,
      phoneNumber:     '01012345678',
      password:        cPass,
      passwordConfirm: cPass,
      role:            'coach',
    }),
  });

  if (createRes.status === 400) {
    const body = await createRes.json();
    const alreadyExists =
      body.errors?.some(e => e.msg?.includes('email already exists')) ||
      body.message?.includes('email already exists');
    if (alreadyExists) {
      console.log(`Coach already exists (${cEmail}) — skipping`);
    } else {
      throw new Error(`Coach creation failed 400: ${JSON.stringify(body)}`);
    }
  } else if (!createRes.ok) {
    throw new Error(`Coach creation failed ${createRes.status}: ${await createRes.text()}`);
  } else {
    console.log(`Coach created (${cEmail})`);
  }

  // Stage 7 (hardening) — same idempotent create-or-skip pattern, for the
  // proScout E2E fixture (never seeded before this stage — research.md R5).
  const createProScoutRes = await fetch(`${API}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name:            'E2E Pro Scout',
      email:           pEmail,
      phoneNumber:     '01098765432',
      password:        pPass,
      passwordConfirm: pPass,
      role:            'proScout',
    }),
  });

  if (createProScoutRes.status === 400) {
    const body = await createProScoutRes.json();
    const alreadyExists =
      body.errors?.some(e => e.msg?.includes('email already exists')) ||
      body.message?.includes('email already exists');
    if (alreadyExists) {
      console.log(`Pro scout already exists (${pEmail}) — skipping`);
      return;
    }
    throw new Error(`Pro scout creation failed 400: ${JSON.stringify(body)}`);
  }

  if (!createProScoutRes.ok) {
    throw new Error(`Pro scout creation failed ${createProScoutRes.status}: ${await createProScoutRes.text()}`);
  }

  console.log(`Pro scout created (${pEmail})`);
}

run().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
