/**
 * Transcribed close to the original design doc's wording, per request —
 * unlike Hyper Bloom's rules dialog, this isn't a fresh rewrite. Trimmed
 * only the non-player-facing bits (the dated "rules are in flux" disclaimer
 * and the physical-prototype poker-deck aside); the prize list is grouped
 * by color instead of the doc's flat sequence for readability, but every
 * value is unchanged.
 */
export function RulesContent() {
  return (
    <>
      <p>The game seats 2-4 players. Each player has a personal deck of money cards, numbered 1-13.</p>
      <p>The players will compete, over a series of auctions, to buy prize cards.</p>

      <h4>Setup</h4>
      <p>
        The six price slots come from six double-sided tiles, each randomly showing one of its two printed
        prices: 2/4, 5/9, 7/11, 13/15, 16/20, and 22/24 — arranged from low to high.
      </p>
      <p>
        Three prizes are drawn and placed in the second, third, and fourth price slots. (Each slot can hold
        one or more prizes, or be empty.) Each player draws two cards from their money deck. The game begins.
      </p>

      <h4>Auctions</h4>
      <p>
        Each auction starts with the player who won the previous one. (For the first auction of the game,
        choose randomly.) To bid, a player must say a number that they could pay exactly by spending one or
        more cards from their hand; they may also pass, in which case they may not bid again in this auction.
        Following players in turn may raise the bid (saying a higher number, that they could also pay
        exactly) or pass. When all but one player have passed, the winning player pays their bid (discarding
        the cards) and takes their choice of prizes from the highest slot whose price is less than or equal
        to their bid. In other words, if the two lowest slots cost 3 and 8, then a bid between 3 and 7
        (inclusive) gets you a prize from the lowest slot — there's no choosing a different slot instead,
        only (if that slot holds more than one prize) which of its prizes to take. No change is given! If you
        bid 20 and take a prize whose price is 8, you still pay 20.
      </p>
      <p>
        All unbought prizes in the display move up one slot. The winner gets to see the next prize and
        decide which slot to place it in — including one that already holds a prize, stacking it there.
        (Winners placing new prizes can't use the upper slots for the first few turns — a slot only becomes
        available once a prize has risen up into it "naturally." This makes the initial ramp-up, before
        players have drawn many cards, gentler.) Two players then draw a card from their money decks: the
        player who won the auction, and the player who first passed.
      </p>
      <p>
        A card that moves up out of the highest slot in the display is discarded permanently; a randomly
        drawn prize enters in the lowest slot to replace it.
      </p>
      <p>
        When a player wins with a bid that points to an empty slot, or a bid lower than the lowest slot, they
        have their choice of three rewards: draw two money cards, move all prizes in the display up one extra
        space, or add two additional prizes to the lowest slot.
      </p>

      <h4>Prizes &amp; point values</h4>
      <p>For a two-player game:</p>
      <ul style={{ marginTop: 4 }}>
        <li>Yellow: 5, 1, 1, 1</li>
        <li>Blue: 4, 2, 2, 1</li>
        <li>Red: 3, 3, 2, 1</li>
      </ul>
      <p>With a third player, add:</p>
      <ul style={{ marginTop: 4 }}>
        <li>Green: 4, 3, 2, 0</li>
        <li>Purple: 5, 4</li>
      </ul>
      <p>With a fourth player, add:</p>
      <ul style={{ marginTop: 4 }}>
        <li>Purple: 0, 0 (on top of the 5, 4 above)</li>
        <li>Orange: 2, 2, 2, 2</li>
      </ul>

      <h4>Scoring</h4>
      <p>At the end of the game, a player gets one additional point for each card in their most common color.</p>
    </>
  );
}
