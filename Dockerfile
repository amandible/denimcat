# Builds the denimcat socket server for deployment (Fly.io, Railway, etc).
# Build context must be the repo root (not packages/server) since the server
# depends on its sibling workspace packages.
#
# Runs the server via `tsx` directly rather than a separate `tsc` build step
# — this sidesteps Node ESM's requirement for explicit `.js` extensions on
# every relative import, which the rest of the codebase doesn't use.
#
# Copies the whole packages/ tree in one shot rather than enumerating each
# workspace package individually — the previous per-package COPY list twice
# caused a silent production crash (ERR_MODULE_NOT_FOUND) when a new engine
# package was added but not also added here. With more games planned, a new
# package should never need a Dockerfile change to deploy correctly.

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages packages

RUN npm ci

ENV NODE_ENV=production
WORKDIR /app/packages/server

EXPOSE 4000
CMD ["npm", "run", "start"]
