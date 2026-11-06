# Versioning a game's rules

Read this before touching a game that already has more than one ruleset
version, or before giving a game its *second* version for the first time.
Mint Condition's v1→v2 split (drawPostAuctionCards / chooseAuctionReward /
placeNewPrize, 2026-11) is the worked example throughout.

## The core idea

A "version" is not a pre-declared interface of overridable seams — we
can't predict ahead of time which piece of a ruleset a future revision
will need to vary. A version is also not a fork of the whole engine
package — that duplicates every unchanged line of code forever.

Instead: a version is a plain object of named functions
(`<Game>Ruleset`), built from whatever the current code already happens
to export as small, separately-named functions. Version 1 is that
object built from the functions as they exist today. Version 2 is
version 1 with ONLY the genuinely-changed functions overridden, via
object spread:

```ts
export const v2Ruleset: SomeGameRuleset = {
  ...v1Ruleset,
  theOneFunctionThatChanged: v2VersionOfThatFunction,
};
```

Everything not listed on the right is the literal same function
reference as v1 — zero duplicated logic for anything that didn't change.
A change touching three unrelated functions produces three small diffs,
not three near-duplicate copies of three larger enclosing functions.

## The interface itself can grow — that's allowed, and expected

`MintConditionRuleset` only has three members
(`drawPostAuctionCards`, `chooseAuctionReward`, `placeNewPrize`) because
those are the only functions a real version has ever needed to vary.
Grow it the moment a real version needs a new seam — never speculatively
ahead of time.

The payload shape of an existing member can change too, not just its
body. Mint Condition's v2 needed `chooseAuctionReward`'s `reward`
parameter to widen from a single three-way string (`AuctionReward`) to a
union that also accepts a two-boolean object (`AuctionRewardChoiceV2`),
because v2's actual rule genuinely needed a differently-shaped payload,
not just different logic. This is exactly what "we can't predict the
future seams" means in practice — when it actually happens, widen the
type at that moment. v1's own implementation only ever handles its half
of the union; TypeScript's interface-method bivariance lets v1's
narrower-typed implementation satisfy the wider interface member without
v1's own code needing to change at all.

## When the varying piece isn't already its own function

Sometimes the thing that needs to vary is buried inside a bigger
function, not already separately named. When — and only when — a real
second version actually needs to vary it: extract just that piece into
its own small named function, as an ordinary refactor of the
current/latest version. Do this reactively, at the moment it's actually
needed, never ahead of time "in case" some future version needs it (see
the root CLAUDE.md: don't go guessing at future functionality).

"Extraction" is sometimes as small as widening a private helper to
`export` — see Mint Condition's `concludeAuction`/`afterPrizeChoice`,
which already existed as their own named functions but needed exporting
so a sibling version-2 file could call them without duplicating them.

## The one real gotcha: private helpers calling siblings by static import

If function A calls function B via a plain `import { B } from './wherever'`
and you build `{ ...v1, B: v2B }`, overriding B does **nothing** for A —
A still calls the original B, because a static import is resolved once,
not looked up through your override object.

If A needs to see the override, A must accept the active ruleset as an
explicit parameter and call `rules.B(...)` instead of calling the
imported `B` directly. Default that parameter to the game's own
`v1Ruleset` so every *existing* caller (including every existing test)
keeps compiling and keeps testing v1 behavior with zero changes:

```ts
function concludeAuction(state: GameState, rules: SomeGameRuleset = v1Ruleset): GameState {
  // ...
  const next = rules.drawPostAuctionCards(state, winnerSeat, firstPasserSeat); // not a bare import call
  // ...
}
```

Do this threading ONCE, the first time it's actually needed (reactive,
same rule as extraction above) — only for the specific call chain a real
second version needs, not the whole engine's call graph speculatively.
Every function in the chain between the dispatch boundary and the
varying leaf function needs the same treatment: accept `rules`, default
it to `v1Ruleset`, forward it to whatever it calls that's in the chain.

**The dispatch boundary itself must call `rules.xxx(...)`, not the
hardcoded function.** It's easy to thread `rules` all the way to the
socket handler and then forget the actual point of it — calling
`chooseAuctionReward(state, seat, reward, rules)` (the hardcoded v1
function, just handed `rules` as its *internal* threading parameter)
instead of `rules.chooseAuctionReward(state, seat, reward, rules)` (an
actual dispatch through the resolved ruleset). The first one silently
always runs v1's logic regardless of which version the room is pinned
to; only the second one actually varies by version. A function that
never varies itself (Mint Condition's `takePrize`, which only needs
`rules` to forward into its own `afterPrizeChoice` call) stays called
directly — it's `rules.chooseAuctionReward`/`rules.placeNewPrize`
specifically (the members of the ruleset interface) that must dispatch
through `rules`, not around it.

## Wiring a room to a version

- `GameModule.currentRulesetVersionId` — the id a brand-new room is
  pinned to right now. A room's `PersistedRoom.rulesetVersion` is copied
  from this exactly once, at creation (`createRoom` in roomCore.ts), and
  never changes for that room's lifetime — an in-progress game is never
  silently migrated onto a later version.
- The game's own server-side code (`gameHandlers.ts`) is what actually
  resolves `room.rulesetVersion` into a real ruleset object (via that
  game's own `resolveRuleset`) — the platform (`RoomStore`,
  `PersistedRoom`, `roomCore.ts`) treats this id as completely opaque
  passthrough data, the same way it already treats `gameId`.
- `undefined` on an existing room means either "this game only ever had
  one version" or "this room predates versioning entirely" — both cases
  mean "treat it as the very first version," never "treat it as
  whatever's current now." Each game's own `resolveRuleset()` is
  responsible for that fallback; the platform never defaults this value
  itself.
- The client's own game package needs the same resolving logic for
  anything player-facing that varies by version — not just engine logic.
  Mint Condition's `rulesVersions.ts` (`resolveRulesContent`) picks which
  rules-text component to render, and `GameView.tsx` branches between
  version-specific gameplay components (e.g. `PrizeChoicePanel` vs.
  `PrizeChoicePanelV2`) wherever what the player actually clicks differs
  by version — not just the wording. The platform passes
  `RoomInfo.rulesetVersion` straight through for exactly this purpose.

## The two pieces of human-readable text

Every `RulesetVersion` carries:
- `designerNote` — the designer's own short note on why/what changed.
  Never invent this text — use `TODO: <description>` until she supplies
  it. Lives on the version object itself, read by future contributors
  working on the next version; it has no dedicated in-game UI.
- `whatsNew` — a longer, player-facing message, shown automatically the
  moment a player enters actual play on a room pinned to a version that
  has one (see `WhatsNewNotice` in the client package) — specifically so
  a repeat playtester expects the new behavior rather than assuming the
  old rules apply. Also never invented — `TODO: <description>` until
  supplied. Omit entirely for a game's first version.

A room pinned to a non-current version also gets a small caveat
rendered inside its own (version-correct) rules text, driven by
`RoomInfo.rulesetNotice.isCurrentVersion`. The rules text itself must be
fully correct for whichever version it's describing — never a
single current-version doc with a bolted-on note about older rooms.
Each version gets its own complete rules component (e.g.
`RulesContent.tsx` for v1, `RulesContentV2.tsx` for v2) — not a diff
against the previous one, since prose doesn't benefit from partial
overriding the way code does.

## Obsoleting and cleaning up an old version

Mark a `RulesetVersion.obsolete: true` once it's genuinely done — no new
room should ever be created on it. By itself this flag changes *nothing*
at runtime: a room already pinned to it keeps working exactly as before,
forever, and `obsolete` is purely a marker for whoever does cleanup
later. The one thing that must be true and is worth a cheap runtime
guard: `currentRulesetVersionId` must never point at an `obsolete`
version (see each game's `versions.ts`).

Before deleting an obsolete version's code, confirm no persisted room
still references it — run `scripts/check-ruleset-version-usage.js` (reads
the rooms table directly, the same way `scripts/migrate-room-data-encoding.js`
does, filtering by `data->>'gameId'` and `data->>'rulesetVersion'`). Only
after that comes back empty should the code be removed:

1. Delete the obsolete version's dedicated override file(s) (e.g. a
   `rulesetV2.ts` with no later survivors depending on its functions) and
   its version-specific client components (rules text, gameplay panels).
2. Remove its entry from `RULESET_VERSIONS` in `versions.ts`.
3. If the version being removed is the one still holding the
   UNSUFFIXED/plain function names (almost always true for the oldest
   surviving version, since every default parameter falls back to it) —
   rename the next-oldest surviving version's functions to take over the
   plain names, since they're now the effective baseline every default
   falls back to.
4. Update any `rules: SomeGameRuleset = v1Ruleset`-style default
   parameter that pointed at the removed version's ruleset object.
5. Delete that version's now-orphaned tests, while keeping every test
   for whatever rules survive as the new baseline.

## Testing across versions

- v1's existing tests are never touched or rewritten — they keep
  exercising v1's functions by their original names, with the new
  trailing `rules` parameter left at its default, exactly as before.
- A new version's tests live in a new file (e.g. `test/rulesetV2.test.ts`),
  calling the v2-named functions (or `v2Ruleset.theFunction(...)`)
  directly — never retrofitted into the v1 test file.
- Integration-level tests that drive a real room end-to-end (not unit
  tests of the engine's exported functions) are NOT protected by the
  default-parameter trick, because a brand-new room is genuinely pinned
  to whichever version is current now — those tests exercise real
  default behavior, so when the default version changes, update their
  assumptions rather than treating the failure as a regression.
- When cleaning up an obsolete version (above), delete its dedicated test
  file along with its code.
