/**
 * Generalized from each engine's own local `EngineResult` (which hardcoded
 * `state` to that engine's specific `GameState` type). A game's engine
 * package re-exports a thin, single-type-parameter wrapper bound to its own
 * state type (e.g. `EngineResult<T = undefined> = SharedEngineResult<GameState, T>`)
 * so none of its call sites need to change.
 */
export interface EngineError {
  code: string;
  message: string;
}

export type EngineResult<TState, T = undefined> =
  | { ok: true; state: TState; data?: T }
  | { ok: false; error: EngineError };

export function ok<TState, T = undefined>(state: TState, data?: T): EngineResult<TState, T> {
  return { ok: true, state, data };
}

export function err<TState = never, T = undefined>(code: string, message: string): EngineResult<TState, T> {
  return { ok: false, error: { code, message } };
}
