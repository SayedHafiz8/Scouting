/**
 * Player CRUD — coach creates a player through the UI; admin cleans it up via API.
 * Each test logs in fresh (no shared storageState) to avoid refresh-token rotation
 * invalidating a shared coach.json between tests.
 */
import { test, expect } from '@playwright/test';
import { loginAsCoach } from '../helpers/auth';
import { apiLogin, apiDeletePlayer } from '../helpers/api';

// Unique name per run so repeated test runs don't collide in the DB
const PLAYER_NAME = `E2E Player ${Date.now()}`;
let createdPlayerId: string | null = null;

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
});

test.afterAll(async ({ request }) => {
  if (!createdPlayerId) return;
  try {
    const adminToken = await apiLogin(
      request,
      process.env.E2E_ADMIN_EMAIL!,
      process.env.E2E_ADMIN_PASSWORD!,
    );
    await apiDeletePlayer(request, adminToken, createdPlayerId);
  } catch (e) {
    console.warn('⚠️  E2E cleanup failed — manually delete player:', createdPlayerId, e);
  }
});

test('coach creates a player and sees it in the list', async ({ page }) => {
  await page.goto('/players/new');
  await expect(page.getByPlaceholder('Player full name')).toBeVisible();

  // Fill required fields.
  // DOB is three plain <select>s (day/month/year, aria-labelled) instead of a
  // native date input; nationality/city are <select>s (formControlName-keyed)
  // instead of free-text inputs — the form was reworked after this test was
  // last updated (see player-form.component.ts).
  await page.getByPlaceholder('Player full name').fill(PLAYER_NAME);
  await page.getByRole('combobox', { name: 'Day' }).selectOption('15');
  await page.getByRole('combobox', { name: 'Month' }).selectOption('3');
  await page.getByRole('combobox', { name: 'Year' }).selectOption('2012'); // 14 years old
  await page.locator('select[formcontrolname="position"]').selectOption('ST');
  await page.locator('select[formcontrolname="preferredFoot"]').selectOption('right');
  await page.locator('select[formcontrolname="nationality"]').selectOption('Egypt');
  const citySelect = page.locator('select[formcontrolname="city"]');
  await expect(citySelect.locator('option')).not.toHaveCount(1, { timeout: 5_000 }); // wait past the placeholder-only state while governorates load
  await citySelect.selectOption({ index: 1 });
  await page.getByPlaceholder('Full address').fill('123 Test Street, Cairo');
  await page.getByPlaceholder('01XXXXXXXXX').fill('01012345678');

  await page.getByRole('button', { name: 'Add Player' }).click();

  // Should redirect to the new player's detail page.
  // The regex must NOT match /players/new (the current URL). A MongoDB ObjectId
  // is 24 hex chars, so [0-9a-f]{24} is unambiguous.
  await page.waitForURL(/\/players\/[0-9a-f]{24}/, { timeout: 15_000 });

  // Capture the player ID from the URL for afterAll cleanup
  const match = page.url().match(/\/players\/([^/]+)/);
  createdPlayerId = match?.[1] ?? null;

  // Navigate to the players list and verify the created player appears there.
  // The test name is "sees it in the list" — this is the primary assertion.
  // We skip a detail-page heading check here because that page is reached via
  // Angular SPA navigation (not page.goto), making it unreliable in headless CI.
  // The list is grouped into a birth-year accordion — the player's name is
  // only rendered once its 2012 group is expanded. Match on the year alone
  // (not a specific player count), since repeated runs can leave other 2012
  // players in the dev DB.
  await page.goto('/players');
  await page.getByRole('button', { name: /2012/ }).click();
  await expect(page.getByText(PLAYER_NAME)).toBeVisible({ timeout: 15_000 });
});
