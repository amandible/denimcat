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
      <p>At the start of the game, the six price slots are set up. This is done by taking another 1-13 set of cards:</p>
      <ul style={{ marginTop: 4 }}>
        <li>Draw three cards from the deck; these, taken individually, will be three of the prices.</li>
        <li>Draw two cards and add them together. This will be another price.</li>
        <li>Draw two more cards and add them together. This will be a fifth price.</li>
        <li>
          Draw three cards and add them together; if that is not yet the highest price on the table, draw a
          fourth card and add it as well. That will be the sixth price.
        </li>
      </ul>
      <p>
        Repeated prices aren't allowed; if one would happen (which is possible in the later steps), those
        cards go back and get redrawn before proceeding to the next step. Prices are arranged from highest to
        lowest.
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
        the cards) and takes their choice of prizes from the display, but they may only take a prize whose
        price is less than or equal to their bid. No change is given! If you bid 20 and take a prize whose
        price is 8, you still pay 20.
      </p>
      <p>
        All unbought prizes in the display move up one slot. The winner gets to see the next prize and
        decide which empty slot to place it in. (Winners placing new prizes can't use the upper slots for the
        first few turns — a slot only becomes available once a prize has risen up into it "naturally." This
        makes the initial ramp-up, before players have drawn many cards, gentler.) Two players then draw a
        card from their money decks: the player who won the auction, and the player who first passed.
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
