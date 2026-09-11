import { describe, expect, it } from 'vitest';
import { CROSSES } from '../src/geometry';

describe('CROSSES', () => {
  // Hand-verified via the orientation test against the real map coordinates
  // in maps/map1.ts: A-H and C-E properly cross in the interior.
  it('detects a real geometric crossing', () => {
    expect(CROSSES['A-H']).toContain('C-E');
    expect(CROSSES['C-E']).toContain('A-H');
  });

  // A-B sits entirely in the upper part of the map, I-J entirely in the
  // lower part — well-separated, no crossing.
  it('does not flag a clearly non-crossing pair', () => {
    expect(CROSSES['A-B']).not.toContain('I-J');
    expect(CROSSES['I-J']).not.toContain('A-B');
  });

  it('never flags two links that share an endpoint, regardless of geometry', () => {
    expect(CROSSES['A-B']).not.toContain('A-C');
    expect(CROSSES['A-C']).not.toContain('A-B');
  });

  it('is symmetric for every pair', () => {
    for (const [id, crossed] of Object.entries(CROSSES)) {
      for (const other of crossed) {
        expect(CROSSES[other]).toContain(id);
      }
    }
  });
});
