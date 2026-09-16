import type { TranslateService } from '@ngx-translate/core';

// How a player is registered with their club — a signed contract, or a
// registration form only. Returns null when it hasn't been recorded, so callers
// skip the row entirely instead of rendering a meaningless dash.
export function registrationLabel(
  p: { registrationType?: 'contract' | 'form' | null } | null | undefined,
  t: TranslateService,
): string | null {
  if (!p?.registrationType) return null;
  return t.instant(
    p.registrationType === 'contract' ? 'PLAYERS.REGISTRATION.CONTRACT' : 'PLAYERS.REGISTRATION.FORM',
  );
}
