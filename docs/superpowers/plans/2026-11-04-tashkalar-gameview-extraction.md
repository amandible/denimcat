# Tash-Kalar GameView Phase-1 Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the ~300 lines of pure, closure-free helpers and small subcomponents out of `client-tashkalar/GameView.tsx` (1600 lines) into sibling files, with zero behavior change.

**Architecture:** Four extraction targets: two new plain-function files (`gameViewStepwiseSim.ts`, `gameViewPlacements.ts`), one new component file following the existing `components/` convention (`components/HandCard.tsx`), and two small functions appended to the existing `factionSpecialRules.ts`. `GameView.tsx` keeps its own function and JSX untouched, just imports these names instead of defining them.

**Tech Stack:** TypeScript, React, Vite. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-tashkalar-gameview-extraction-design.md`

## Global Constraints

- Zero behavior change — every extracted function/component's logic is moved verbatim, not rewritten.
- `GameView`'s own function body, handlers, and JSX are untouched in every task — only its import list changes.
- No automated test runner exists for this client (confirmed: no `package.json` of its own, typechecked/bundled as part of `packages/client`). Verification per task is `tsc --noEmit` + `vite build`; one manual browser click-through happens once, in the final task, not per task.

## Review Focus

- **Relative import paths change when a file moves.** `HandCard`/`FlareThresholdIcon` currently live in `GameView.tsx` (the directory root) and import `FRIENDLY_COLOR`/`PatternPreview` from `./components/PatternPreview` and `PieceRankIcon` from `./components/PieceRankIcon`. Once `HandCard`'s definition moves into `components/HandCard.tsx`, those become `./PatternPreview` and `./PieceRankIcon` (same directory now), and `withAlpha` (currently `./pieceColors`) becomes `../pieceColors` (one level up). Getting either wrong is a typecheck failure, not a silent bug, but it's the one mechanical step with real room for a mistake.
- **`factionPanelsInPlay` needs a `Color` import** it doesn't currently need to declare itself (it's only ever called from within `GameView.tsx`, which already imports `Color` for other reasons) — `factionSpecialRules.ts` only imports `FactionKind` today. Task 4 adds the import.
- **Nothing outside `GameView.tsx` currently imports any of these twelve names** (confirmed by grepping the whole `client-tashkalar` directory) — so no other file needs updating in any task besides the one gaining the new definition and `GameView.tsx` itself losing it.

---

### Task 1: `gameViewStepwiseSim.ts`

**Files:**
- Create: `private-games/other-games/client-tashkalar/gameViewStepwiseSim.ts`
- Modify: `private-games/other-games/client-tashkalar/GameView.tsx`

**Interfaces:**
- Produces: `SupplySnapshot` (type), `StepwiseSim` (interface), `supplySnapshot(gameState: GameStateView): SupplySnapshot`, `makeScratchState(board: (Piece | null)[][], players: SupplySnapshot): GameState`, `simulateStagedSteps(board, color: Color, pending: {...}, steps: Coord[], players: SupplySnapshot): StepwiseSim`, `stepwiseHighlights(board, color: Color, pending: {...}, steps: Coord[], players: SupplySnapshot): Coord[]` — verbatim from GameView.tsx:123-213, doc comments included.
- Consumes: nothing from this plan's other tasks.

- [ ] **Step 1: Create `gameViewStepwiseSim.ts`** — move the `StepwiseSim` interface, `SupplySnapshot` type, and the four functions (`supplySnapshot`, `makeScratchState`, `simulateStagedSteps`, `stepwiseHighlights`) verbatim out of `GameView.tsx` (lines 123-213). Import `adjacentCells`, `applyEffectStep`, `pieceAt`, `stepwiseMaxSteps`, and the types `Color`, `Coord`, `EffectDomain`, `GameState`, `GameStateView`, `Piece` from `@denimcat/engine-tashkalar`.

- [ ] **Step 2: Update `GameView.tsx`'s imports** — delete the moved definitions; add `import { makeScratchState, simulateStagedSteps, stepwiseHighlights, supplySnapshot, type StepwiseSim, type SupplySnapshot } from './gameViewStepwiseSim';` (only import the names actually referenced later in the file — `makeScratchState` and the `StepwiseSim`/`SupplySnapshot` types may turn out to be used only internally by the moved functions themselves; check each name's remaining use in `GameView.tsx`'s body before deciding which to import back).

- [ ] **Step 3: Typecheck**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit`
Expected: PASS, no errors (this project includes `client-tashkalar` in its `tsconfig.json`'s `include`, so this one command covers both).

- [ ] **Step 4: Build**

Run: `cd packages/client && npx vite build`
Expected: PASS.

- [ ] **Step 5: Commit, including the submodule pointer bump**

`client-tashkalar` lives in the `private-games/other-games` submodule (a separate repo) — see `docs/adding-a-new-game.md`'s two-step submodule-then-pointer-bump pattern. Commit inside the submodule and push it first, then bump the superproject's pointer to the new commit:

```bash
cd private-games/other-games
git add client-tashkalar/gameViewStepwiseSim.ts client-tashkalar/GameView.tsx
git commit -m "refactor: extract stepwise-card simulation helpers out of GameView.tsx"
git push
cd ../..
git add private-games/other-games
git commit -m "refactor: extract stepwise-card simulation helpers out of GameView.tsx"
git push
```

---

### Task 2: `gameViewPlacements.ts`

**Files:**
- Create: `private-games/other-games/client-tashkalar/gameViewPlacements.ts`
- Modify: `private-games/other-games/client-tashkalar/GameView.tsx`

**Interfaces:**
- Produces: `filterByMinEnemyPiecesNearTarget<T extends {target: Coord}>(placements: T[], board, color: Color, minEnemyPiecesNearTarget: number | undefined): T[]`, `withAdjacentSummonBonus(placements: PlacementCandidate[], gameState: GameStateView, color: Color, pattern: ParsedPattern, rank: PieceRank): PlacementCandidate[]`, `placementsFor(gameState: GameStateView, color: Color, handIndex: number)`, `placementsForLegendary(gameState: GameStateView, color: Color, handIndex: number)`, `placementsForDiscardTop(gameState: GameStateView, color: Color, owner: Color)` — verbatim from GameView.tsx:341-420, doc comments included.
- Consumes: nothing from this plan's other tasks.

- [ ] **Step 1: Create `gameViewPlacements.ts`** — move all five functions verbatim out of `GameView.tsx` (lines 341-420). Import `afterward`, `adjacentSummonBonusPlacements`, `allCells`, `cardDefinition`, `findPlacements`, `legendaryCardDefinition`, and the types `Color`, `Coord`, `GameStateView`, `ParsedPattern`, `Piece`, `PieceRank`, `PlacementCandidate` from `@denimcat/engine-tashkalar`.

- [ ] **Step 2: Update `GameView.tsx`'s imports** — delete the moved definitions; add `import { placementsFor, placementsForDiscardTop, placementsForLegendary } from './gameViewPlacements';` (same check-before-importing rule as Task 1 — `filterByMinEnemyPiecesNearTarget` and `withAdjacentSummonBonus` are only called from within the three `placementsFor*` functions themselves, so `GameView.tsx` likely doesn't need to import them directly; confirm by checking for any remaining direct reference).

- [ ] **Step 3: Typecheck**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `cd packages/client && npx vite build`
Expected: PASS.

- [ ] **Step 5: Commit, including the submodule pointer bump**

```bash
cd private-games/other-games
git add client-tashkalar/gameViewPlacements.ts client-tashkalar/GameView.tsx
git commit -m "refactor: extract client-side placement search out of GameView.tsx"
git push
cd ../..
git add private-games/other-games
git commit -m "refactor: extract client-side placement search out of GameView.tsx"
git push
```

---

### Task 3: `components/HandCard.tsx`

**Files:**
- Create: `private-games/other-games/client-tashkalar/components/HandCard.tsx`
- Modify: `private-games/other-games/client-tashkalar/GameView.tsx`

**Interfaces:**
- Produces: `FlareThresholdIcon({upgraded}: {upgraded: boolean})`, `FLARE_UNAVAILABLE_COLOR` (constant), `DISCARD_MODE_RETURN_TINT` (constant), `HandCard({title, subtitle, text, pattern, selected, disabled, backgroundTint, onClick}: {...})` — verbatim from GameView.tsx:252-338 (`FlareThresholdIcon` and `HandCard`, plus the `FLARE_UNAVAILABLE_COLOR`/`DISCARD_MODE_RETURN_TINT` constants between them), doc comments included.
- Consumes: nothing from this plan's other tasks.

- [ ] **Step 1: Create `components/HandCard.tsx`** — move `FlareThresholdIcon`, `FLARE_UNAVAILABLE_COLOR`, `DISCARD_MODE_RETURN_TINT`, and `HandCard` verbatim out of `GameView.tsx` (lines 252-338). Update the three imports this code uses (they're one directory level closer now — `HandCard.tsx` lives in `components/`, same as the files it imports from): `FRIENDLY_COLOR`/`PatternPreview` from `./PatternPreview` (was `./components/PatternPreview`), `PieceRankIcon` from `./PieceRankIcon` (was `./components/PieceRankIcon`), `withAlpha` from `../pieceColors` (was `./pieceColors`). Also import `type { ReactNode }` from `'react'` and `type { ParsedPattern } from '@denimcat/engine-tashkalar'`.

- [ ] **Step 2: Update `GameView.tsx`'s imports** — delete the moved definitions; add `import { HandCard } from './components/HandCard';` (`FlareThresholdIcon`/`FLARE_UNAVAILABLE_COLOR`/`DISCARD_MODE_RETURN_TINT` are also directly referenced in `GameView`'s own JSX per this plan's Review Focus — import those too: `import { DISCARD_MODE_RETURN_TINT, FLARE_UNAVAILABLE_COLOR, FlareThresholdIcon, HandCard } from './components/HandCard';`).

- [ ] **Step 3: Typecheck**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `cd packages/client && npx vite build`
Expected: PASS.

- [ ] **Step 5: Commit, including the submodule pointer bump**

```bash
cd private-games/other-games
git add client-tashkalar/components/HandCard.tsx client-tashkalar/GameView.tsx
git commit -m "refactor: extract HandCard and its small helpers into components/HandCard.tsx"
git push
cd ../..
git add private-games/other-games
git commit -m "refactor: extract HandCard and its small helpers into components/HandCard.tsx"
git push
```

---

### Task 4: Append to `factionSpecialRules.ts`, final verification, and submodule pointer

**Files:**
- Modify: `private-games/other-games/client-tashkalar/factionSpecialRules.ts`
- Modify: `private-games/other-games/client-tashkalar/GameView.tsx`
- Modify: `hyperbloom` superproject's submodule pointer (`private-games/other-games`)

**Interfaces:**
- Produces (appended to `factionSpecialRules.ts`): `frozenEffectText(fullText: string): string`, `factionPanelsInPlay(seats: {faction: FactionKind; seat: Color}[]): {faction: FactionKind; seat: Color; text: string | null}[]` — verbatim from GameView.tsx:221-224 and :235-244, doc comments included.
- Consumes: nothing from this plan's other tasks.

- [ ] **Step 1: Update `factionSpecialRules.ts`** — append `frozenEffectText` and `factionPanelsInPlay` verbatim after the existing `FACTION_SPECIAL_RULES` export. Add `Color` to the existing `import type { FactionKind } from '@denimcat/engine-tashkalar';` line (becomes `import type { Color, FactionKind } from '@denimcat/engine-tashkalar';`).

- [ ] **Step 2: Update `GameView.tsx`'s imports** — delete the two moved functions; add `frozenEffectText, factionPanelsInPlay` to the existing `import { FACTION_SPECIAL_RULES } from './factionSpecialRules';`-style import (check the exact current import line for this file and extend it, rather than adding a second import statement for the same module).

- [ ] **Step 3: Typecheck**

Run: `cd packages/client && npx tsc -p tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 4: Build**

Run: `cd packages/client && npx vite build`
Expected: PASS.

- [ ] **Step 5: Confirm the line-count move**

Run: `wc -l private-games/other-games/client-tashkalar/GameView.tsx private-games/other-games/client-tashkalar/gameViewStepwiseSim.ts private-games/other-games/client-tashkalar/gameViewPlacements.ts private-games/other-games/client-tashkalar/components/HandCard.tsx private-games/other-games/client-tashkalar/factionSpecialRules.ts`
Expected: `GameView.tsx` down to roughly 1300 lines (1600 minus the ~300 extracted, plus a handful of new import lines); the four other files sized roughly as estimated in the design doc (`gameViewStepwiseSim.ts` ~90-100 lines, `gameViewPlacements.ts` ~80-90 lines, `components/HandCard.tsx` ~90-100 lines, `factionSpecialRules.ts` grown from 31 to roughly 50 lines).

- [ ] **Step 6: Manual browser verification**

Start the dev server (`cd packages/client && npm run dev`, plus the server if not already running) and play through a short Tash-Kalar hotseat game covering what this phase touched: summon a common card (exercises `placementsFor`), summon a legendary card (`placementsForLegendary`), trigger Flock's Visionary Summoner if convenient (`placementsForDiscardTop`), play a War Sled/Glacier Giant/Sylvan stepwise card and press through its multi-step preview (`simulateStagedSteps`/`stepwiseHighlights`), bank and later activate an Everfrost frozen effect (`frozenEffectText`'s display), and open the faction-rules panel to confirm Hotfoot Labs/Flock/Afterward's text still renders (`factionPanelsInPlay`). Confirm every hand card still renders with its pattern preview and tint (`HandCard`/`FlareThresholdIcon`).

- [ ] **Step 7: Commit, including the submodule pointer bump**

```bash
cd private-games/other-games
git add factionSpecialRules.ts GameView.tsx
git commit -m "refactor: move frozenEffectText and factionPanelsInPlay into factionSpecialRules.ts"
git push
cd ../..
git add private-games/other-games
git commit -m "refactor: complete Tash-Kalar GameView phase-1 helper extraction"
git push
```
