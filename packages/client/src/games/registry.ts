export interface GameDescriptor {
  slug: string;
  displayName: string;
  namespace: string;
  tagline: string;
}

export const GAMES: GameDescriptor[] = [
  {
    slug: 'hyperbloom',
    displayName: 'Hyper Bloom',
    namespace: '/hyperbloom',
    tagline: 'A 2-4 player abstract deckbuilder by shiobana.',
  },
  {
    slug: 'mint-condition',
    displayName: 'Mint Condition',
    namespace: '/mint-condition',
    tagline: 'Auction game by a_mandible (testing).',
  },
  {
    slug: 'love-triangles',
    displayName: 'Love Triangles',
    namespace: '/love-triangles',
    tagline: 'Claim lines to form loops - by a_mandible (testing).',
  },
  {
    slug: 'tashkalar',
    displayName: 'Tash-Kalar',
    namespace: '/tashkalar',
    tagline: 'Testing fan factions',
  },
  // King's Gate is built but not currently on the game-select screen — not
  // being actively followed up on for now. Its code (engine/server/client
  // under private-games/other-games, plus App.tsx's routing) is untouched,
  // so re-adding this entry is all it takes to bring it back.
];
