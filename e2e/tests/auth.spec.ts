/**
 * Auth flow — these tests intentionally start WITHOUT a saved session so they
 * can exercise the login page itself. The `storageState` is explicitly reset
 * to empty to override the coach.json default set on the chromium project.
 */
import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('login redirects coach to dashboard and shows stat cards', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByPlaceholder('coach@example.com')).toBeVisible();

    await page.getByPlaceholder('coach@example.com').fill(process.env.E2E_COACH_EMAIL!);
    await page.getByPlaceholder('••••••••').fill(process.env.E2E_COACH_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL('**/dashboard/coach', { timeout: 15_000 });
    await expect(page.getByText('My Dashboard')).toBeVisible();
    // exact:true scopes to the stat-card <p> labels (exact, case-sensitive) so
    // 'Selected' no longer also matches a lowercase 'selected' span elsewhere.
    await expect(page.getByText('Total Players', { exact: true })).toBeVisible();
    await expect(page.getByText('Selected', { exact: true })).toBeVisible();
  });

  test('wrong password keeps user on login page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByPlaceholder('coach@example.com').fill(process.env.E2E_COACH_EMAIL!);
    await page.getByPlaceholder('••••••••').fill('WrongPass9999');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Should NOT redirect — stays on login
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/auth\/login/);
  });

  test('unauthenticated visit to /players redirects to login', async ({ page }) => {
    await page.goto('/players');
    // authGuard appends ?returnUrl=... (see auth.guard.ts), so the glob must
    // not anchor on a bare "/auth/login" suffix.
    await page.waitForURL('**/auth/login**', { timeout: 10_000 });
    await expect(page.getByPlaceholder('coach@example.com')).toBeVisible();
  });
});
