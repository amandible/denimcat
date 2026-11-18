import { describe, expect, it } from 'vitest';
import { GAME_SLUGS, parseRoute } from '../src/routes';

describe('parseRoute', () => {
  it('recognizes a room URL for every game, upper-casing the code', () => {
    for (const slug of GAME_SLUGS) {
      expect(parseRoute(`/${slug}/room/abcd`, '')).toEqual({ kind: 'room', slug, roomCode: 'ABCD' });
    }
  });

  it('recognizes each game home (with or without trailing slash) and notes page', () => {
    for (const slug of GAME_SLUGS) {
      expect(parseRoute(`/${slug}`, '')).toEqual({ kind: 'game-home', slug });
      expect(parseRoute(`/${slug}/`, '')).toEqual({ kind: 'game-home', slug });
      expect(parseRoute(`/${slug}/notes`, '')).toEqual({ kind: 'game-notes', slug });
    }
  });

  it('rejects malformed room codes and unknown games', () => {
    expect(parseRoute('/detour/room/ABC', '')).toEqual({ kind: 'home' });
    expect(parseRoute('/detour/room/ABCDE', '')).toEqual({ kind: 'home' });
    expect(parseRoute('/not-a-game/room/ABCD', '')).toEqual({ kind: 'home' });
    expect(parseRoute('/not-a-game', '')).toEqual({ kind: 'home' });
  });

  it('handles auth verify (only with a token) and settings', () => {
    expect(parseRoute('/auth/verify', '?token=xyz')).toEqual({ kind: 'auth-verify', token: 'xyz' });
    expect(parseRoute('/auth/verify', '')).toEqual({ kind: 'home' });
    expect(parseRoute('/settings', '')).toEqual({ kind: 'settings' });
    expect(parseRoute('/', '')).toEqual({ kind: 'home' });
  });
});
