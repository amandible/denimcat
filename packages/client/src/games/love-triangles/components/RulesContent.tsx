/**
 * Transcribed close to the original design doc's wording, per request —
 * unlike Hyper Bloom's rules dialog, this isn't a fresh rewrite. Trimmed
 * only the non-player-facing bits (a Claude-directed aside about map
 * generation, and a local file-path reference).
 */
export function RulesContent() {
  return (
    <>
      <p>
        Love Triangles is a game for 2-4 players. It involves building a network of links, similar to an
        intercity train network (though in this case they represent links in a social network).
      </p>
      <p>
        A given map consists of ten points within a circle. The game consists of a map, a deck of 45 cards
        showing all possible links between the nodes, and gems used as currency.
      </p>

      <h4>Display &amp; buying</h4>
      <p>
        There's a display with two rows of three cards; the rest of the cards sit in a draw deck. Only the
        top row is available at a given moment — the cards below it give information about what will be
        available soon.
      </p>
      <p>
        On each turn, a player may pass (gaining two gems) or buy one link card from the display. After
        paying the printed cost plus any modifiers, the player buying a card draws that card's link in their
        own color. The card that was below the purchased card moves up into its place, and a new card is
        drawn to fill the lower row. It is now the next player's turn.
      </p>

      <h4>Crossings</h4>
      <p>
        Drawn lines can never cross. When a card in the display becomes unplayable because it would cross an
        existing line, it is removed from the game, and each player that owns any of the lines it would cross
        gets one gem from the supply. (Even a player who owns multiple relevant lines only gets one gem!)
        This can happen to a card already in the display (because a crossing line from elsewhere in the
        display was bought) or when a card is newly added to the display that's already unplayable. When a
        card is removed this way, the display refreshes the same way as if a card was bought — lower row
        cards move up if possible, and then a new card is drawn for the lower row.
      </p>

      <h4>Cost modifiers</h4>
      <p>
        Cards cost extra based on which players are already present at each end; a player is present at a
        node if they own any existing line incident to that node. The extra cost is one gem per player per
        node, paid to opponents (when they are present) or to the bank (when you yourself are already present
        at a node where you're building). So to connect B and C with a 4-cost line when you're already
        present at both B and C, and the Green player is already present at C, will cost 7: 6 to the bank and
        1 to Green.
      </p>
      <p>The first player starts with 9 gems, the second with 10, and so on.</p>

      <h4>End of game &amp; scoring</h4>
      <p>
        The game ends when the display is empty (all cards have either been bought or removed as
        unplayable). Each player scores 2 points per node in the largest loop of their edges, plus 1 point
        per other node they can reach via their edges from that loop. Remaining gems is a tiebreaker; if
        still tied, players share the victory.
      </p>
    </>
  );
}
