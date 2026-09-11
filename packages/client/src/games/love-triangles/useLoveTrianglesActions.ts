import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, LinkId, LoveTrianglesEvent, RemovedUnplayableEvent } from '@denimcat/engine-love-triangles';
import { useRoomConnection } from '../../state/useRoomConnection';

/** How long a non-removal step's resulting state stays on screen before the next queued event runs. */
const STEP_DELAY_MS: Record<'purchased' | 'refilled', number> = {
  purchased: 500,
  refilled: 500,
};

/** How long to hold the "here's the doomed card and the lines crossing it" callout before actually removing it. */
const HIGHLIGHT_DELAY_MS = 1100;
/** A short beat after the removal + refill lands before moving on to whatever's queued next. */
const SETTLE_DELAY_MS = 500;

export function useLoveTrianglesActions(roomCode: string) {
  const [displayedState, setDisplayedState] = useState<GameState | null>(null);
  const [animating, setAnimating] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<RemovedUnplayableEvent | null>(null);
  const queueRef = useRef<LoveTrianglesEvent[]>([]);
  const processingRef = useRef(false);

  const drainQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    setAnimating(true);

    const step = () => {
      const next = queueRef.current.shift();
      if (!next) {
        processingRef.current = false;
        setAnimating(false);
        setPendingRemoval(null);
        return;
      }

      if (next.kind === 'removed_unplayable') {
        // Phase 1: call out the doomed card + the lines crossing it against
        // the board as it stands right now (before removing anything) —
        // this is the moment the designer specifically wants visible.
        setPendingRemoval(next);
        setTimeout(() => {
          // Phase 2: apply the actual removal + refill result.
          setPendingRemoval(null);
          setDisplayedState(next.state);
          setTimeout(step, SETTLE_DELAY_MS);
        }, HIGHLIGHT_DELAY_MS);
        return;
      }

      setDisplayedState(next.state);
      setTimeout(step, STEP_DELAY_MS[next.kind]);
    };
    step();
  }, []);

  const handleEvents = useCallback(
    (events: LoveTrianglesEvent[]) => {
      queueRef.current.push(...events);
      drainQueue();
    },
    [drainQueue],
  );

  const connection = useRoomConnection<GameState>('love-triangles', '/love-triangles', roomCode, {
    extraListeners: { love_triangles_events: handleEvents },
  });

  // Reset when leaving 'in-room' (e.g. leaveSeat, or a fresh reconnect
  // still pending) so the next arrival re-seeds cleanly instead of keeping
  // a stale board from a previous seat/session.
  useEffect(() => {
    if (connection.status !== 'in-room') {
      queueRef.current = [];
      processingRef.current = false;
      setAnimating(false);
      setPendingRemoval(null);
      setDisplayedState(null);
    }
  }, [connection.status]);

  // Self-healing resync: whenever the connection's authoritative state
  // changes (an initial join, a reconnect ack, or a live mutation's
  // broadcast) and no animation event log shows up to explain it within a
  // short grace window, just adopt it directly.
  //
  // This — not the event queue — is what actually keeps the board live
  // across a reconnect: `reconnect_room`'s ack sets `connection.gameState`
  // directly, but reconnecting never runs a mutation, so it never produces
  // a `love_triangles_events` follow-up the way a live buy/pass does. An
  // earlier version of this hook only ever seeded `displayedState` once
  // (the first time it was null) and otherwise relied solely on the event
  // queue — which silently stopped tracking reality after any socket drop
  // and reconnect (a Fly cold-start between turns, a network blip, a
  // backgrounded tab), since reconnecting produces no event log to drain.
  // The grace window is what still lets a live mutation's event log win
  // the race and animate normally: `game_state` and its event log are
  // emitted back-to-back server-side, so the log is already draining
  // (`processingRef.current` true) well before this timer fires.
  useEffect(() => {
    if (connection.status !== 'in-room' || !connection.gameState) return;
    const state = connection.gameState;
    const timer = setTimeout(() => {
      if (!processingRef.current && queueRef.current.length === 0) {
        setDisplayedState(state);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [connection.status, connection.gameState]);

  const buyLink = useCallback((linkId: LinkId) => connection.sendAction('buy_link', { linkId }), [connection]);
  const pass = useCallback(() => connection.sendAction('pass'), [connection]);

  return { ...connection, gameState: displayedState, animating, pendingRemoval, buyLink, pass };
}

export type LoveTrianglesConnection = ReturnType<typeof useLoveTrianglesActions>;
