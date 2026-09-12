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
    tagline: 'A 2-player grid game of movement, mana, and magic circles.',
  },
  {
    slug: 'mint-condition',
    displayName: 'Mint Condition',
    namespace: '/mint-condition',
    tagline: 'A 2-4 player card auction for colorful prizes.',
  },
];
