import { Page } from '@playwright/test';

/** Log in as the E2E coach via the UI login form. */
export async function loginAsCoach(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('coach@example.com').fill(process.env.E2E_COACH_EMAIL!);
  await page.getByPlaceholder('••••••••').fill(process.env.E2E_COACH_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard/coach', { timeout: 15_000 });
}

// Stage 7 (hardening) — mirrors loginAsCoach exactly; the login form itself is
// role-agnostic (same fields regardless of which role's credentials are sent).
/** Log in as the E2E proScout via the UI login form. */
export async function loginAsProScout(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('coach@example.com').fill(process.env.E2E_PROSCOUT_EMAIL!);
  await page.getByPlaceholder('••••••••').fill(process.env.E2E_PROSCOUT_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard/proScout', { timeout: 15_000 });
}
