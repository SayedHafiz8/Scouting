import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { allowedTo } from '../../controllers/authController.js';

// Stage 7 (hardening) — the deny-by-default guarantee, correctly scoped per
// specs/009-proscout-hardening/spec.md Story 4 / FR-012 / research.md R4.
//
// Constitution Principle II is explicit: absence of `allowedTo` on a route
// means every registered role is allowed, not denied. There is no code-level
// mechanism that flips this default for a route someone forgets to guard.
// So this file proves the two narrower things that ARE mechanically true:
//   (a) allowedTo(...) itself, as a function, always denies a role not in its
//       argument list — independent of which routes call it.
//   (b) the number of HTTP-method registrations across Backend/routes/*.js
//       matches the number of operation rows in the Stage 7 endpoint
//       inventory — so a route added without a matching, reviewed inventory
//       row fails this check, even though allowedTo's own behavior is
//       unaffected by the omission.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('allowedTo(...) role-list behavior, independent of any route (FR-012)', () => {
  it('denies a role not in its argument list', async () => {
    const req = { user: { role: 'proScout' } };
    const next = vi.fn();

    await allowedTo('admin')(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(403);
  });

  it('allows a role that is in its argument list', async () => {
    const req = { user: { role: 'proScout' } };
    const next = vi.fn();

    await allowedTo('proScout')(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('allows when the role list has multiple entries including the caller\'s role', async () => {
    const req = { user: { role: 'proScout' } };
    const next = vi.fn();

    await allowedTo('coach', 'observer', 'proScout')(req, {}, next);

    expect(next.mock.calls[0][0]).toBeUndefined();
  });
});

describe('route/inventory operation-count parity (FR-012)', () => {
  it('the number of HTTP-method registrations in Backend/routes/*.js matches the Stage 7 inventory row count', () => {
    const routesDir = path.resolve(__dirname, '../../routes');
    const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));

    let routeOperationCount = 0;
    for (const file of routeFiles) {
      const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
      const matches = content.match(/\.(get|post|patch|delete|put)\(/g);
      routeOperationCount += matches ? matches.length : 0;
    }

    const inventoryPath = path.resolve(
      __dirname,
      '../../../specs/009-proscout-hardening/contracts/endpoint-inventory.md'
    );
    let inventoryContent = fs.readFileSync(inventoryPath, 'utf-8');
    // The reconciliation table at the top of the doc lists deltas (some of the
    // same operations again), not the current per-router list — exclude it so
    // each operation is counted exactly once, from its §1-11 section only.
    inventoryContent = inventoryContent.replace(
      /<!-- reconciliation-table:[\s\S]*?<!-- \/reconciliation-table -->/,
      ''
    );
    const inventoryRows = inventoryContent.match(/^\| `(GET|POST|PATCH|PUT|DELETE) /gm);
    const inventoryOperationCount = inventoryRows ? inventoryRows.length : 0;

    expect(inventoryOperationCount).toBe(routeOperationCount);
  });
});
