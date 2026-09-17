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
    tagline: 'A 2-player abstract deckbuilder.',
  },
  {
    slug: 'mint-condition',
    displayName: 'Mint Condition',
    namespace: '/mint-condition',
    tagline: 'A 2-4 player auction.',
  },
  {
    slug: 'love-triangles',
    displayName: 'Love Triangles',
    namespace: '/love-triangles',
    tagline: 'Playing gems to claim lines.',
  },
  {
    slug: 'tashkalar',
    displayName: 'Tash-Kalar',
    namespace: '/tashkalar',
    tagline: 'Testing fan factions',
  },
];
