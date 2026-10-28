/**
 * Transcribed close to design/detour/rules.md's own wording, per the
 * established convention for this platform's rules dialogs (see Mint
 * Condition's RulesContent.tsx) — not a fresh rewrite. Broken into
 * headed sections for readability; every value and rule is unchanged.
 */
export function RulesContent() {
  return (
    <>
      <p>For 2-4 players.</p>

      <h4>Components</h4>
      <p>Neutral cards numbered 1-18. A single shared pawn. A score tracker.</p>
      <p>
        Four player decks, each numbered 1-20. Each card has an arrow on it pointing in one of the four
        cardinal directions. One player's deck has an up arrow on the 1, a left arrow on the 2, right on the
        3, and down on the 4, then repeats (up on the 5, etc.) Another player has a left on the 1, right on
        the 2, etc. In this way, each player has a different arrow on the 1, and so on for every number.
      </p>

      <h4>Setup</h4>
      <p>
        Before the game, the neutral cards are dealt out, one per cell, onto the board shown here. The pawn
        is placed on the neutral 18.
      </p>
      <p>
        Each player takes a different personal deck (chosen at random) and draws three cards. (At 2 or 3
        players, some decks will be unused.)
      </p>

      <h4>Turns</h4>
      <p>
        Each turn a player will play a card and then (if possible) draw a card. The game ends after 20
        turns, when all cards have been played.
      </p>
      <p>
        On a player's turn, they choose a card from their hand and play it onto a lower-numbered card
        (neutral or any player's) that does not contain the pawn. They then move the pawn one space in the
        direction indicated by the card they've just played. If that caused the pawn to move onto a card of
        the active player's color, then they gain a point and the pawn moves again in the direction
        indicated by the card it is now on. This continues until the pawn either moves onto a card that does
        not belong to the active player, tries to move off the board, or tries to move onto a card it has
        already moved onto this turn.
      </p>
      <p>
        Any card that's too low to play (that is, it's equal or lower than every card on the board) becomes
        wild: it can be played on any stack.
      </p>

      <h4>Scoring</h4>
      <p>
        When everybody's hand is empty, players gain 1VP for each of their cards that is visible (i.e. it's
        on top of a stack) and the highest score wins.
      </p>
    </>
  );
}
