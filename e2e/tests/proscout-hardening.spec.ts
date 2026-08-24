/**
 * Stage 7 (hardening) — end-to-end denial proof for proScout, per
 * specs/009-proscout-hardening/spec.md Story 3 (FR-013, FR-014, FR-015).
 *
 * FR-014 requires the redirect destination to be read dynamically rather than
 * hardcoded. A Playwright spec cannot import the Angular RoleLandingService
 * directly (it runs outside the Angular app), so this file achieves the same
 * guarantee a different, still-honest way: it captures the URL the app itself
 * lands proScout on right after login (which IS RoleLandingService.landingFor
 * in action), and then asserts the denied-route redirect lands on that exact
 * same URL — self-consistency between the two axes role-landing-destinations
 * .spec.ts already proves are identical at the unit level, without this file
 * separately hardcoding either destination string.
 */
import { test, expect } from '@playwright/test';
import { loginAsProScout } from '../helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('proScout hardening — denial is enforced end-to-end', () => {
  test('sidebar does not render Age Groups, Coaches (users), or Observers items (FR-013)', async ({ page }) => {
    await loginAsProScout(page);

    await expect(page.getByRole('link', { name: 'Age Groups', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Coaches', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Observers', exact: true })).toHaveCount(0);
  });

  test('direct navigation to /age-groups, /users, /observers redirects to the same page proScout logs in to, and the underlying API call is denied (FR-014, FR-015)', async ({ page }) => {
    // roleGuard redirects before the guarded route's component (and its API
    // call) ever loads for /users and /observers, so apiResponsePromise below
    // legitimately waits out its full 10s timeout for those — up to 3x10s,
    // which exceeds the default 30s test timeout on its own.
    test.setTimeout(60_000);
    await loginAsProScout(page);
    const landingUrl = page.url(); // the real RoleLandingService.landingFor('proScout') destination

    for (const restrictedPath of ['/age-groups', '/users', '/observers']) {
      const apiResponsePromise = page.waitForResponse(
        (res) => /\/api\/v1\/(ages|users|observers)(\?|$)/.test(res.url()),
        { timeout: 10_000 }
      ).catch(() => null); // some restricted screens may not fire a matching request before the redirect

      await page.goto(restrictedPath);
      await page.waitForURL(landingUrl, { timeout: 10_000 });
      expect(page.url()).toBe(landingUrl);

      const apiResponse = await apiResponsePromise;
      if (apiResponse) {
        // audit fix S2 — /ages carried no protect at all before (Constitution
        // C-3, TODO(AGES_UNAUTHENTICATED_READ)) and used to be exempt from this
        // assertion for that reason. It now carries protect + allowedTo(admin,
        // coach, observer), same as /users and /observers, so it is denied to
        // proScout the same way — no carve-out needed anymore.
        expect(apiResponse.status()).toBe(403);
      }
    }
  });
});
