#!/usr/bin/env node
/**
 * Quick "did it boot with every game registered?" check against a running
 * denimcat server — local or production. Read-only.
 *
 * Calls GET /health, which reports the id of every registered game, and
 * compares that against the expected list. (Probing Socket.IO namespaces
 * can't answer this: the sign-in gate is attached to a catch-all parent
 * namespace, which creates a namespace for ANY name on demand.)
 *
 * Usage:
 *   node scripts/smoke-test-server.js [baseUrl] [gameId...]
 *
 *   baseUrl   defaults to http://localhost:4000
 *   gameId    defaults to every current game (see EXPECTED_GAMES)
 *
 * Exits 0 if healthy and every expected game is registered, 1 otherwise.
 */

const EXPECTED_GAMES = ['hyperbloom', 'mint-condition', 'love-triangles', 'detour', 'tashkalar', 'kingsgate'];

function printHelp() {
  console.log(`Usage: node scripts/smoke-test-server.js [baseUrl] [gameId...]

Checks a running denimcat server's GET /health: it must answer ok, and
list every expected game as registered.

  baseUrl   default: http://localhost:4000
  gameId    default: ${EXPECTED_GAMES.join(' ')}

Example (production): node scripts/smoke-test-server.js https://denimcat-server.fly.dev`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }
  const baseUrl = (args[0] ?? 'http://localhost:4000').replace(/\/$/, '');
  const expected = args.length > 1 ? args.slice(1) : EXPECTED_GAMES;

  let body;
  try {
    // Generous timeout: a Fly machine may be cold-starting.
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(30000) });
    body = await res.json();
  } catch (error) {
    console.log(`FAIL  /health: ${error.message}`);
    return 1;
  }
  if (body.ok !== true) {
    console.log(`FAIL  /health returned ${JSON.stringify(body)}`);
    return 1;
  }
  console.log('ok    /health');

  const registered = Array.isArray(body.games) ? body.games : [];
  let failed = false;
  for (const game of expected) {
    const ok = registered.includes(game);
    if (!ok) failed = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${game}${ok ? '' : ' — not registered (see registerGame calls in packages/server/src/index.ts)'}`);
  }
  for (const game of registered.filter((g) => !expected.includes(g))) {
    console.log(`note  ${game} is registered but wasn't in the expected list`);
  }
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code));
