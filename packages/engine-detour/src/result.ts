import type { EngineResult, GameState } from './types';

export function ok<T = undefined>(state: GameState, data?: T): EngineResult<T> {
  return { ok: true, state, data };
}

export function err<T = undefined>(code: string, message: string): EngineResult<T> {
  return { ok: false, error: { code, message } };
}
