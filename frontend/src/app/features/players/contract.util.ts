import type { TranslateService } from '@ngx-translate/core';

// Contract state derived from a player's contractEndDate / isFreeAgent.
// The stored date is UTC midnight on the 1st of the contract's final month, so
// the contract runs through the end of that month — expiry is the 1st of the
// month after. Remaining time is expressed in whole months (how people say it:
// "about a year and two months left"), no day-level precision.
export interface ContractInfo {
  kind: 'free' | 'expired' | 'active' | 'none';
  years: number;
  months: number;
}

export function contractInfo(
  p: { contractEndDate?: string | null; isFreeAgent?: boolean } | null | undefined,
  now: Date = new Date(),
): ContractInfo {
  const none: ContractInfo = { kind: 'none', years: 0, months: 0 };
  if (!p) return none;
  if (p.isFreeAgent) return { kind: 'free', years: 0, months: 0 };
  if (!p.contractEndDate) return none;

  const end = new Date(p.contractEndDate);
  if (Number.isNaN(end.getTime())) return none;

  // expiry = first day of the month after the contract's final month
  const expiryY = end.getUTCFullYear();
  const expiryM = end.getUTCMonth() + 1;
  const totalMonths =
    (expiryY - now.getUTCFullYear()) * 12 + (expiryM - now.getUTCMonth());

  if (totalMonths <= 0) return { kind: 'expired', years: 0, months: 0 };
  return { kind: 'active', years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

// Fully localized one-liner for the card / detail page. Returns null when there
// is nothing to show (no contract info at all).
export function contractLabel(
  p: { contractEndDate?: string | null; isFreeAgent?: boolean } | null | undefined,
  t: TranslateService,
  now?: Date,
): string | null {
  const info = contractInfo(p, now);
  if (info.kind === 'none') return null;
  if (info.kind === 'free') return t.instant('PLAYERS.CONTRACT.FREE_AGENT');
  if (info.kind === 'expired') return t.instant('PLAYERS.CONTRACT.EXPIRED');

  const unit = (n: number, u: 'YEAR' | 'MONTH'): string => {
    const key = n === 1 ? `${u}_1` : n === 2 ? `${u}_2` : n <= 10 ? `${u}_FEW` : `${u}_MANY`;
    return t.instant(`PLAYERS.CONTRACT.${key}`, { n });
  };

  const parts: string[] = [];
  if (info.years) parts.push(unit(info.years, 'YEAR'));
  if (info.months) parts.push(unit(info.months, 'MONTH'));
  return t.instant('PLAYERS.CONTRACT.REMAINING', {
    time: parts.join(t.instant('PLAYERS.CONTRACT.AND')),
  });
}
