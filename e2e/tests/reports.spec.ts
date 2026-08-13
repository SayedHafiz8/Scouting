/**
 * Scouting report — coach creates a report for a player through the UI.
 * The player is created/deleted via API to keep the test focused on the report form.
 * Each test logs in fresh (no shared storageState) to avoid refresh-token rotation
 * invalidating a shared coach.json between tests.
 */
import { test, expect } from '@playwright/test';
import { loginAsCoach } from '../helpers/auth';
import { apiLogin, apiCreatePlayer, apiDeletePlayer } from '../helpers/api';

let playerId: string;
let coachToken: string;

test.beforeAll(async ({ request }) => {
  // Log in as coach via API to create test data
  coachToken = await apiLogin(
    request,
    process.env.E2E_COACH_EMAIL!,
    process.env.E2E_COACH_PASSWORD!,
  );

  playerId = await apiCreatePlayer(request, coachToken, {
    name: `E2E Report Target ${Date.now()}`,
    dateOfBirth: '2011-06-10',
    team: 'Al Ahly',
    position: 'CM',
    preferredFoot: 'left',
    nationality: 'Egyptian',
    city: 'Cairo',
    address: '1 Test Ave, Cairo',
    phoneNumber: '01112233445',
  });
});

test.afterAll(async ({ request }) => {
  try {
    const adminToken = await apiLogin(
      request,
      process.env.E2E_ADMIN_EMAIL!,
      process.env.E2E_ADMIN_PASSWORD!,
    );
    await apiDeletePlayer(request, adminToken, playerId);
  } catch (e) {
    console.warn('⚠️  E2E cleanup failed — manually delete player:', playerId, e);
  }
});

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
});

test('coach submits a scouting report and it appears in the report list', async ({ page }) => {
  await page.goto(`/players/${playerId}/reports/new`);

  // Wait for report form to render inside the player detail shell
  await expect(page.getByText('New Report')).toBeVisible();

  // Set match date to today
  const today = new Date().toISOString().split('T')[0];
  await page.locator('input[type="date"]').fill(today);

  // Choose recommendation
  await page.getByRole('button', { name: 'Promote' }).click();

  // All 12 skill sliders default to 5 — no need to change them

  await page.getByRole('button', { name: 'Save Report' }).click();

  // Should redirect back to the reports list for this player
  await page.waitForURL(`**/players/${playerId}/reports`, { timeout: 15_000 });

  // The report list renders cards, not a table. The count label is the most
  // reliable indicator that the list has loaded with the submitted report.
  // Long timeout for the same SPA async-fetch reason as the players heading.
  await expect(page.getByText('1 report(s)')).toBeVisible({ timeout: 15_000 });
});

test('report statistics update after the first report', async ({ page }) => {
  // Navigate to the statistics endpoint via the UI breadcrumb or directly
  // The report list page has a "Statistics" section or we rely on the API
  // This is a lightweight sanity check via direct API call
  const res = await page.request.get(
    `${process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1'}/players/${playerId}/reports/statistics`,
    { headers: { Authorization: `Bearer ${coachToken}` } },
  );
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.data.statistics.totalReports).toBeGreaterThan(0);
  expect(body.data.statistics.overallRating).toBe(5); // all sliders at default 5
});
