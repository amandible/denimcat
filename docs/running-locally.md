# Running denimcat locally

## First-time setup

The private games (Hyper Bloom, Tash-Kalar, King's Gate) live in a git
submodule, and the public server/client import them directly — nothing
builds or installs without it.

```sh
git clone --recurse-submodules https://github.com/amandible/denimcat.git
# or, after a plain clone:
git submodule update --init --recursive

npm install   # from the repo root — sets up every workspace
```

## Dev servers (two terminals)

```sh
# Terminal 1 — socket/HTTP server on :4000
cd packages/server
DATABASE_URL="" npm run dev

# Terminal 2 — Vite client on :5173
cd packages/client
npm run dev
```

Then open http://localhost:5173.

**Always pass `DATABASE_URL=""` to the dev server.** `packages/server/.env`
may hold the real Neon connection string, and the server would otherwise
read and write production rooms and accounts. The empty value wins over
`.env` (dotenv never overrides a variable that's already set) and switches
to in-memory storage; the startup line confirms it with
`persistence: in-memory only`. In-memory means every restart (including
`tsx watch` reloading on a file save) wipes all rooms and sessions — you'll
need to sign in again.

The client talks to `http://localhost:4000` unless `VITE_SERVER_URL` is set
(see `docs/environment-and-deploy.md`).

## Signing in locally

With no Resend email configured and `NODE_ENV` not `production`, the
sign-in screen shows a **"Sign in now (dev)"** button after you request a
link, instead of "check your email". The link is also printed in the
server log (`[email:noop] would send ...`). For that link to point at your
local client, set `APP_BASE_URL=http://localhost:5173` in
`packages/server/.env`.

This shortcut is deliberately impossible in production — see
`shouldExposeDevLinks` in `packages/platform/src/auth/authService.ts`.

## Tests and typechecks

```sh
npm test                               # every workspace, from the repo root
npm run test:engine-mint-condition     # one engine (see root package.json)
cd packages/server && npx vitest run test/auth.test.ts   # one file
```

Typecheck a package with `npx tsc --noEmit -p tsconfig.json` from inside it.
Note that each package's `tsconfig.json` covers `src/` only, and vitest
strips types without checking them — so type errors in test files go
unnoticed unless they cause a runtime failure.

The client's vitest tests (`packages/client/test/`) cover only pure
logic such as route parsing; there are no component tests. Verify client
work with `npx tsc -p tsconfig.json --noEmit` and `npx vite build` in
`packages/client`, then a real pass in a browser.

To check a running server has every game registered:
`node scripts/smoke-test-server.js` (defaults to `http://localhost:4000`).
