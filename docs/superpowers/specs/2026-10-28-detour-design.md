# Detour — Design

**Spec source:** `design/detour/rules.md` (Alison's own design), clarified
through conversation on 2026-10-28.

**Revision (2026-10-28, post-playtest):** a hotseat test surfaced two
problems — the pawn getting stuck on edges often, and games running a
little long. Alison's fix, folded into the sections below: shrink the
board to a 4x4 square (16 cells), shrink the neutral deck and all four
player decks to 16 cards each (1-16, matching the cell count), and make
the pawn wrap around the board edges (a torus) instead of stopping
there. The wrap eliminates the old "off-board" chain-stop case entirely
— a chain now stops only two ways: landing on a card that isn't the
active player's, or re-entering a cell already visited this chain.

## Intent

Detour is a new 2-4 player game for the denimcat platform, designed by
Alison. It's a card-placement-and-pawn-chase game: each turn a player
covers a lower-numbered card on a shared board with one from their hand,
then a shared pawn hops across the board following that card's printed
arrow — chaining extra hops (and points) whenever it lands on a card of
the active player's own color. The goal of this doc is to pin down every
place the hand-written rules doc left something unresolved, so the actual
implementation plan doesn't have to guess.

## Goals

- A faithful, rules-accurate implementation of Detour for 2-4 players,
  following the same platform conventions as the existing five games (see
  `docs/adding-a-new-game.md`).
- Both normal (multi-browser) and hotseat play, consistent with every
  other game here.

## Non-goals

- No AI opponent, no solo-vs-bot mode.
- No variant rule support (fixed 4-player-only mode, alternate boards,
  etc.) beyond what's specified below.

## Constraints

- Public game (Alison's own original design) — lives in `packages/`, not
  the private submodule.
- Follows the `GameModule` contract in `packages/platform/src/gameModule.ts`
  and every other platform convention documented in
  `docs/adding-a-new-game.md`.

## Approach

There is one sensible way to build this: the same
engine/server/client package shape every other game on this platform
already uses (see `docs/adding-a-new-game.md`). No real alternative was
considered or is worth considering.

## Rules, as resolved

### Components

- 16 neutral cards, numbered 1-16.
- Four player decks, each 16 cards (1-16). Every card has one of four
  cardinal arrows. All four decks share the same underlying cycle,
  [up, left, right, down] repeating every 4 cards (card 1=up, 2=left,
  3=right, 4=down, 5=up, ...) — but each deck starts the cycle rotated
  one step further than the last: deck A = [up,left,right,down] repeating,
  deck B = [left,right,down,up] repeating, deck C = [right,down,up,left]
  repeating, deck D = [down,up,left,right] repeating. Confirmed with
  Alison: for any given number 1-16, each of the four decks has a
  different arrow on it.
- A single shared pawn.
- A score tracker (one running number per player — see Scoring below).

### Board

A 4-column × 4-row square grid, 16 cells, standard orthogonal (rook-wise)
adjacency for up/down/left/right — **and the board wraps at every edge
(a torus)**: moving off one side re-enters from the opposite side of the
same row or column (revised post-playtest; see Pawn movement and
chaining below). Confirmed with Alison; this is a fixed shape regardless
of player count.

Before the game, the 16 neutral cards are shuffled and dealt face-up, one
per cell, filling the 16-cell board in random position. The pawn starts
wherever card 16 landed.

### Player count and deck assignment

2, 3, or 4 players. **Which decks are in play is random, not tied to seat
order** — confirmed with Alison: a 2-player game could have any two of the
four decks (e.g. A+C, not necessarily A+B). The seat list itself (`p1`,
`p2`, ...) stays the conventional `CANDIDATE_SEATS.slice(0, playerCount)`
pattern used everywhere else on the platform; it's the deck/rotation
assigned to each seat that's randomized at game creation (shuffle the four
rotations, assign the first N to the N seats in play). An unused deck for
a sub-4-player game is simply never dealt from, drawn from, or referenced
— it doesn't enter play in any form.

### Turn structure

Each player starts with 3 cards in hand, dealt randomly from their own
(shuffled) 16-card deck. On a turn: play one card from hand onto any
board cell *other than the one the pawn currently occupies* whose current
top card has a strictly lower number, covering what was there; then draw
one card if their deck isn't empty (no fixed hand cap). Over a player's
16 individual turns they play all 16 of their own cards and draw 13 times
(starting hand 3 + 13 draws = 16 played), so the deck empties with
exactly 3 turns left where a play happens with no following draw. The
game ends once every seated player's hand (and deck) is empty — which
happens for everyone at once, since every seated player takes the same
number of turns.

**Placement direction, and the generalized wild rule** — confirmed with
Alison, correcting an earlier misreading on my part: a card is played
*onto* a board cell whose current top card has a strictly **lower**
number (so top-of-stack values trend upward as the game goes on; a hand
of only low cards gets harder to place as play continues, not easier).
The rules doc's "the 1 is wild" is superseded by a more general rule: **a
card with no legal (lower-numbered) target anywhere on the board may
instead be played on any cell regardless of value** — evaluated per card,
not per hand. This is a strict superset of the 1-is-wild rule (1 can
never have a legal lower-numbered target, so it's unconditionally covered
by the general rule) and means a player is never actually stuck: every
card in hand always has *some* legal play, either normally or as this
fallback (subject to the pawn's-cell restriction below). There is no "no
legal play" / forced-pass case to handle.

**The pawn's own cell is never a legal target** — confirmed with Alison,
a separate restriction from the number rule above, and applying equally
to every play including the wild-card fallback: a card with no *other*
legal target becomes playable on any *non-pawn* cell, not literally
anywhere.

### Pawn movement and chaining

After playing a card, the pawn moves one space in that card's printed
arrow direction. If that move lands the pawn on a card belonging to the
*active* player (the one who just played, by whichever deck/color their
card came from), they score a point and the pawn moves again, this time
following the direction on the card it just landed on — chaining for as
long as each successive landing is on the active player's own card. The
chain stops the moment it lands on a card that isn't the active player's
(neutral or another player's), or (see below) the moment it would
re-enter a cell already visited this chain.

**The board wraps at every edge — a torus, revised post-playtest** — a
move off one side of the 4x4 board re-enters from the opposite side of
the same row or column, independently for rows and columns (so a move
off a corner wraps both axes at once). This replaces the original
design's "off-board moves are legal but stop the chain" rule: every move
now always lands on a real cell, so there is no off-board case left to
handle, for the first move after playing a card or any chain
continuation. The fix was chosen specifically to stop the pawn getting
stuck near edges, which the original fixed-boundary board made common.

**Chain loops are prevented by a once-per-turn visit rule** — confirmed
with Alison, in response to a reviewer-surfaced gap: two of a player's
own cards can end up with arrows pointing at each other, which would
otherwise chain forever. The pawn may not enter the same cell twice
within a single chain (i.e. within one played card's resulting sequence
of moves) — if the next move would land on a cell already visited earlier
in this same chain, the chain stops there instead (same treatment as
landing on a non-owned card: no point for that step, but earlier points
in the chain still count).

### Scoring

One score track per player, confirmed with Alison: chain-move points
accumulated throughout the game, plus — once every player's hand is
empty — 1 more point for each of that player's cards currently on top of
a stack anywhere on the board (a card buried under a later play doesn't
count, for anyone, neutral or player-owned). Final score is the sum;
highest wins.

## What's left to the builder

- **Tie handling.** Not addressed by the rules doc. Every other game here
  (Love Triangles, Mint Condition) declares a shared win on a tie rather
  than a tiebreaker — follow that same convention unless told otherwise.
- **First player / turn order.** Not addressed. Use the same convention
  as the rest of the platform (seat order, `p1` first) unless the
  implementer finds a reason to do otherwise.
- **Personal deck shuffle.** The rules say "draw a card" without stating
  draw order explicitly; treat each player's 16-card deck as shuffled at
  deal time (consistent with every other game's "deck" concept here,
  e.g. Mint Condition's money deck) rather than drawn in fixed 1-16
  order.
- **Display/naming conventions** (score panel, recap, chat, log
  substitution for the engine's raw seat-id log text, feedback) — already
  fully specified by the existing platform convention; see
  `docs/adding-a-new-game.md` and the `playerLabel`/`substituteSeatTokens`
  helpers. No new design decision needed here.
- **Rules-dialog text** — superseded after launch: Alison asked the panel
  to track this design doc's resolved rules directly, rather than
  transcribing `design/detour/rules.md`'s wording.
- **Game/landing-page tagline** — Alison's own words; now set to "Cards +
  arrows - first draft".
