import { Page } from '@playwright/test';

/** Log in as the E2E coach via the UI login form. */
export async function loginAsCoach(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByPlaceholder('coach@example.com').fill(process.env.E2E_COACH_EMAIL!);
  await page.getByPlaceholder('••••••••').fill(process.env.E2E_COACH_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard/coach', { timeout: 15_000 });
}
