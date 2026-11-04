# Tash-Kalar GameView Phase-1 Extraction — Design

**Spec source:** conversation during a "fresh eyes" audit of the denimcat
monorepo on 2026-11-04 — pure internal refactor, no designer rules
involved.

## Intent

`private-games/other-games/client-tashkalar/GameView.tsx` is 1600 lines
— the largest file in the repo. About 300 of those lines, near the top
of the file, are pure, closure-free helper functions and small
subcomponents that happen to be defined above the `GameView` component
but don't reference any of its local state. Move those out. The
remaining ~1200 lines (the `GameView` function itself and its many
state-closing handlers) are explicitly out of scope — splitting those
means consolidating state/handlers into a hook or threading props
through new subcomponents, which is real surgery on the most complex
game's main interaction surface, and this client has no automated UI
test runner (only manual click-through) to catch a mistake. That's a
separate, not-yet-decided future phase.

## Goals

- Move every closure-free helper/subcomponent currently defined above
  `export function GameView(...)` into sibling files, by natural
  grouping.
- Zero behavior change — the app typechecks, builds, and plays
  identically before and after.

## Non-goals

- No change to `GameView`'s own body, its handlers, or its JSX.
- No change to any extracted function's logic, only its file location
  and (where needed) its imports.
- No new automated tests invented for this client — there is none
  today, and inventing one is out of scope for a pure extraction.

## Constraints

- Follows CLAUDE.md's "prefer smaller, focused files" guidance.
- `client-tashkalar` has no own `package.json`/test runner — it's
  typechecked and bundled as part of `packages/client` (see
  `packages/client/tsconfig.json`'s `include` and `npm run build`).
  Verification is `tsc --noEmit` + `vite build` + manual browser
  click-through, the established convention for this client.

## Approach

Four extraction targets, grouped by what the code is actually for
(confirmed by reading every call site — all current usages of these
twelve names are inside `GameView`'s own body, none in any other
file):

- **`gameViewStepwiseSim.ts`** — `SupplySnapshot` (type),
  `StepwiseSim` (interface), `supplySnapshot`, `makeScratchState`,
  `simulateStagedSteps`, `stepwiseHighlights`. The stepwise-card
  (War Sled, Glacier Giant, Sylvan's Charging Buck/Kiskin Boughrunner)
  local preview simulation.
- **`gameViewPlacements.ts`** — `filterByMinEnemyPiecesNearTarget`,
  `withAdjacentSummonBonus`, `placementsFor`, `placementsForLegendary`,
  `placementsForDiscardTop`. Client-side legal-placement search against
  the already-public board.
- **`components/HandCard.tsx`** — `FlareThresholdIcon`,
  `FLARE_UNAVAILABLE_COLOR`, `DISCARD_MODE_RETURN_TINT`, `HandCard`.
  Follows the existing `components/` convention every other
  faction-panel component in this directory already uses. All four are
  used together in the hand-rendering section of `GameView`'s JSX.
- **`factionSpecialRules.ts`** (existing file, 31 lines — append, don't
  create a new file) — `factionPanelsInPlay` fits this file's existing
  theme exactly (it directly consumes `FACTION_SPECIAL_RULES`, already
  defined there). `frozenEffectText` has no natural existing home (it's
  4 lines of Everfrost-specific text-slicing, used inline in
  `GameView`'s render body, not inside any existing Everfrost
  component) — rather than invent a new file for 4 lines, or force it
  into one of the three groups above where it doesn't thematically
  belong, it's appended here too as the pragmatic smallest-footprint
  choice.

## What's left to the builder

- Exact import ordering/grouping within each new file (which of the
  `@denimcat/engine-tashkalar` types each file actually needs — the
  plan's tasks list the specific names, but the implementer arranges
  the import statement itself).
