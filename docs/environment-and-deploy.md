# Environment variables and deployment

Two deployables: the **server** (`packages/server`, Fly.io app
`denimcat-server`, Dockerfile at the repo root) and the **client**
(`packages/client`, Vercel project `denimcat`). Production secrets live in
those platforms' settings, never in the repo. For local development see
`docs/running-locally.md`.

## Server variables

Set in production with `fly secrets set NAME=value -a denimcat-server`;
locally via `packages/server/.env` (template: `.env.example`).

| Variable | What it does | If missing |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string. All games share one pool and one `rooms` table, plus the auth/survey tables (`ensureSchema` creates them on boot). | In-memory storage: every restart loses all rooms, accounts, and sessions. Locally, pass `DATABASE_URL=""` on purpose so you don't touch production data. |
| `CLIENT_ORIGIN` | Allowed CORS origin(s) for Socket.IO and the HTTP routes. Comma-separated for several (e.g. the vercel.app URL plus the custom domain). | Any origin (`*`). Fine locally. |
| `RESEND_API_KEY`, `RESEND_FROM` | Real email via Resend: sign-in links, turn notifications, game-over emails, new-account notices. **Both** are required. | A noop sender that only logs. In production that means nobody can sign in by email; the server logs a startup `WARNING`. |
| `APP_BASE_URL` | Base URL for links inside emails (sign-in, turn reconnect). Production: the client's public URL. Locally: `http://localhost:5173`. | Emails go out without a clickable link — sign-in becomes impossible. |
| `OWNER_EMAIL` | Receives "new account created" notices, and is the one account allowed to see the playtest-notes views. | No notices; nobody is owner. |
| `NODE_ENV` | The Dockerfile sets `production`. That permanently disables returning sign-in links in the HTTP response (the local "Sign in now (dev)" button). | Not production, so dev sign-in links are allowed when no email sender is configured. **Never unset this in the Dockerfile.** |
| `PORT` | Listen port. | `4000` (matches `internal_port` in `fly.toml`). |

## Client variables

Set in the Vercel dashboard (Project Settings → Environment Variables);
locally via `packages/client/.env.local` (template: `.env.example`).

| Variable | What it does | If missing |
|---|---|---|
| `VITE_SERVER_URL` | Server base URL, baked into the bundle at build time. Production: `https://denimcat-server.fly.dev`. | `http://localhost:4000`. |
| `HYPERBLOOM_TOKEN` | Build-time only, not bundled. A read-only, fine-grained GitHub token for the private `denimcat-nonpublic` repo, used by `vercel.json`'s `installCommand` to fetch the submodule. Vercel's own clone can't fetch a private submodule even with GitHub App access, which is why this exists. | The Vercel build fails because the submodule's files are missing. |

## Deploying

**Server** (needed for any change under `packages/platform`,
`packages/server`, a server-side engine, or `private-games/.../server-*`
and `engine-*`):

```sh
fly deploy -a denimcat-server          # from the repo root
curl -s https://denimcat-server.fly.dev/health   # expect {"ok":true}
```

`fly deploy` builds from your local working tree, including the
checked-out submodule, so deploy from a clean, committed state. Fly
machines auto-stop when idle (`min_machines_running = 0`), so the first
request after a quiet spell is a cold start. The project prefers batching
server changes into fewer deploys.

**Client:** push to `main`. Vercel's GitHub integration builds and deploys
automatically. **Don't run `vercel deploy` from the CLI**: its upload has
no `.git` directory, so the `installCommand`'s
`git submodule update` fails. If a push doesn't produce a deployment,
disconnecting and reconnecting the Git integration in the Vercel dashboard
has fixed it before.

**Private-submodule changes** go in two commits: commit and push inside
`private-games/other-games` first, then commit the outer repo's updated
submodule pointer.
