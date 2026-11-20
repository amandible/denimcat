/**
 * v3's own complete, correct rules text — not a diff against v2's
 * RulesContentV2.tsx. Transcribed close to the designer's own wording in
 * design/mint-condition/rules.md (trimming only the dated "rules are in
 * flux" disclaimer, a non-player-facing aside). See docs/guides/game-rule-versions.md.
 */
export function RulesContentV3() {
  return (
    <>
      <p>The game seats 2-4 players. Each player has a personal deck of money cards: four 10s, four 5s and four 1s.</p>
      <p>The players will compete, over a series of auctions, to buy prize cards.</p>

      <h4>Setup</h4>
      <p>At the start of the game, the six price slots are set up depending on player count:</p>
      <ul style={{ marginTop: 4 }}>
        <li>2 players: 0, 5, 10, 15, 20, 25</li>
        <li>3 players: 5, 10, 15, 20, 25, 30</li>
        <li>4 players: 10, 15, 20, 25, 30, 35</li>
      </ul>
      <p>
        Draw three prizes and put them in the second, third and fourth price slots. (Each slot can hold one
        or more prizes, or be empty.) Each player draws two cards from their money deck. The game begins.
      </p>

      <h4>Auctions</h4>
      <p>
        Each auction starts with the player who won the previous one. (For the first auction of the game,
        choose randomly.)
      </p>
      <p>
        To bid, a player must say a number that they could pay exactly by spending one or more cards from
        their hand; they may also pass, in which case they may not bid again in this auction. Following
        players in turn may raise the bid (saying a higher number, that they could also pay exactly) or
        pass. When all but one player have passed, the winning player pays their bid (discarding the cards)
        and takes their choice of prizes from the highest slot whose price is less than or equal to their
        bid. In other words, if the two lowest slots are 5 and 15, then bidding anything from 5 to 14
        (inclusive) gets you a card from that lowest row.
      </p>
      <p>
        Then comes end-of-auction resolution: all unbought prizes in the display move up one slot, a new
        card from the prize deck is revealed into the lowest slot, and every player draws a card. If a
        player ever needs to draw a card but their deck is empty, they shuffle their discards to form a new
        draw pile.
      </p>
      <p>
        If a card moved up out of the highest slot in the display, it's discarded permanently and an
        additional prize enters the lowest slot to replace it.
      </p>
      <p>
        By the way, when a player wins with a bid that points to an empty slot, or a bid lower than the
        lowest slot, they draw extra cards, and can choose to accelerate the game by moving all cards up an
        extra slot. The extra cards they get are: 1 for winning a bid below the lowest price, 2 for winning
        a bid on either of the lowest two slots, 3 for winning a bid in the middle two slots, or 4 for
        winning a bid on either of the top two slots. This all happens before normal end-of-round
        resolution, so if they make the extra move happen, it's before new cards are added to the lowest
        slot.
      </p>

      <h4>Prizes</h4>
      <p>
        Here's the composition of the prize deck. Each color has a theme that links the cards it contains,
        but mechanically they're just a color and a value. Cards marked with one star (*) only appear in a
        3 or 4 player game, and cards marked with two stars (**) are only used in a four-player game.
      </p>
      <p>
        <strong>Blue (print)</strong>
      </p>
      <ul style={{ marginTop: 4 }}>
        <li>4 — handwritten &ldquo;I Have A Dream&rdquo; draft</li>
        <li>2 — &ldquo;The Vengeance of Nitocris&rdquo; manuscript</li>
        <li>2 — The Mystery of Edwin Drood ending (hoax)</li>
        <li>1 — A Humument 1st edition</li>
      </ul>
      <p>
        <strong>Red (gaming)</strong>
      </p>
      <ul style={{ marginTop: 4 }}>
        <li>3 — Vimose Hnefatafl set</li>
        <li>3 — Lewis chessman</li>
        <li>2 — Vettweiss-Froitzheim dice tower</li>
        <li>1 — Visconti-Sforza tarot deck</li>
      </ul>
      <p>
        <strong>Yellow (audio)</strong>
      </p>
      <ul style={{ marginTop: 4 }}>
        <li>5 — missing Watergate tapes</li>
        <li>1 — Casey Kasem swearing at his staff</li>
        <li>1 — The &ldquo;Butcher Cover&rdquo; LP</li>
        <li>1 — Once Upon A Time In Shaolin</li>
      </ul>
      <p>
        <strong>Green (toys)*</strong>
      </p>
      <ul style={{ marginTop: 4 }}>
        <li>4 — Inland Steel Barbie</li>
        <li>3 — Lego Sears Tower</li>
        <li>2 — Green Unicron Optimus Prime</li>
        <li>0 — Number 1 Bear</li>
      </ul>
      <p>
        <strong>Purple (antique gripes)</strong>
      </p>
      <ul style={{ marginTop: 4 }}>
        <li>*5 — criticism of Ea-Nasir&rsquo;s copper</li>
        <li>*4 — letter from Iddin-Sin to Vinu demanding nicer clothes</li>
        <li>**0 — sock requisition from Vindolanda</li>
        <li>**0 — Scots-Roman curse roll</li>
      </ul>
      <p>
        <strong>Orange (curiosities)**</strong>
      </p>
      <ul style={{ marginTop: 4 }}>
        <li>2 — insect pigment</li>
        <li>2 — laughing automaton</li>
        <li>2 — clown egg</li>
        <li>2 — glass flower</li>
      </ul>

      <h4>End of game</h4>
      <p>
        When the last prize card is added to the display, the game immediately ends. Whichever player has
        the most money left in hand takes the lowest-valued card left in the display; if there's a tie for
        most money nobody gets it, and if there's a tie for lowest value, the player may choose.
      </p>

      <h4>Scoring</h4>
      <p>
        At the end of the game, a player gets a bonus for the number of cards in each color: 0 for a
        singleton, 3 for a pair, 6 for a triple and 10 for getting all of one color.
      </p>
    </>
  );
}
