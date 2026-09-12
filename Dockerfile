# Builds the denimcat socket server for deployment (Fly.io, Railway, etc).
# Build context must be the repo root (not packages/server) since the server
# depends on its sibling workspace packages (@denimcat/shared,
# @denimcat/platform, @denimcat/engine-hyperbloom).
#
# Runs the server via `tsx` directly rather than a separate `tsc` build step
# — this sidesteps Node ESM's requirement for explicit `.js` extensions on
# every relative import, which the rest of the codebase doesn't use.

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/platform/package.json packages/platform/package.json
COPY packages/engine-hyperbloom/package.json packages/engine-hyperbloom/package.json
COPY packages/engine-mint-condition/package.json packages/engine-mint-condition/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json

RUN npm ci

COPY packages/shared packages/shared
COPY packages/platform packages/platform
COPY packages/engine-hyperbloom packages/engine-hyperbloom
COPY packages/server packages/server

ENV NODE_ENV=production
WORKDIR /app/packages/server

EXPOSE 4000
CMD ["npm", "run", "start"]
