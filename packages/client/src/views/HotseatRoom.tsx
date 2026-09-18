import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import type { RoomConnection } from '../state/useRoomConnection';

/**
 * Mounts one real, correctly-redacted connection for `seat` — auto-joining
 * or auto-reconnecting via `useActions`'s `role` option, no manual seat-pick
 * click needed — and reports it up to HotseatRoom on every change. Renders
 * nothing itself; one of these exists per seat, mounted via `.map()` in the
 * parent (never in a loop inside a single component), so each keeps its own
 * `useActions` hook call and this respects the Rules of Hooks.
 */
function HotseatSeatConnector<TConnection extends RoomConnection<unknown>>({
  seat,
  roomCode,
  useActions,
  onConnection,
}: {
  seat: string;
  roomCode: string;
  useActions: (roomCode: string, options?: { role?: string }) => TConnection;
  onConnection: (seat: string, connection: TConnection) => void;
}) {
  const connection = useActions(roomCode, { role: seat });
  useEffect(() => {
    onConnection(seat, connection);
  });
  return null;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ textAlign: 'center', marginTop: 100, color: 'var(--muted)', fontSize: 16 }}>{children}</div>;
}

/** Extracts a `RoomConnection<TView>`'s own `TView`, so `getTurnSeat` below can be typed against the real per-game state shape rather than `unknown`. */
type ViewOf<TConnection extends RoomConnection<unknown>> = TConnection extends RoomConnection<infer TView> ? TView : never;

/**
 * A shared-device ("hotseat") room: every seat is auto-joined from this one
 * tab over its own real connection (so hand/board redaction stays exactly
 * as correct as normal online play — there's no omniscient viewer mode,
 * see useRoomConnection's `role` option doc comment), with a toolbar to
 * switch which seat's full view is currently showing, or show them all at
 * once side by side. Fully game-agnostic: takes the same
 * `{ useActions, candidateSeats, seatLabel }` shape every game's `XRoom.tsx`
 * already passes to LobbyView, plus its own `GameView` component.
 *
 * `getTurnSeat`, when given, switches the active seat automatically the
 * instant a turn changes — no click needed. Confirmed with the designer:
 * for now this always fires immediately, even for hidden-info games where
 * a real two-human hand-off would eventually want a neutral "pass the
 * device" screen first (not built yet — this is solo-testing-only for
 * now, so revealing the next seat's hand immediately is fine). Manual
 * switching stays available too (e.g. to peek at a seat out of turn).
 */
export function HotseatRoom<TConnection extends RoomConnection<unknown>>({
  roomCode,
  useActions,
  candidateSeats,
  seatLabel,
  GameView,
  getTurnSeat,
}: {
  roomCode: string;
  useActions: (roomCode: string, options?: { role?: string }) => TConnection;
  candidateSeats: string[];
  seatLabel: (seat: string) => string;
  GameView: ComponentType<{ roomCode: string; connection: TConnection }>;
  getTurnSeat?: (gameState: ViewOf<TConnection>) => string | null | undefined;
}) {
  const [connections, setConnections] = useState<Record<string, TConnection>>({});
  const [activeSeat, setActiveSeat] = useState(candidateSeats[0]);
  const [splitView, setSplitView] = useState(false);

  const handleConnection = useCallback((seat: string, connection: TConnection) => {
    setConnections((prev) => ({ ...prev, [seat]: connection }));
  }, []);

  const allReady = candidateSeats.every((seat) => connections[seat]?.status === 'in-room');
  const anyError = candidateSeats.map((seat) => connections[seat]?.lastError).find((e) => e);

  // Every seat's connection sees the same `turn` (it's public, not part of
  // any per-seat redaction), so any one ready connection's gameState works.
  // Tracks the last turn we auto-applied so a manual override (clicking a
  // different seat to peek) sticks for the rest of that same turn, rather
  // than snapping back on the next unrelated gameState update.
  const lastAppliedTurnSeatRef = useRef<string | null>(null);
  useEffect(() => {
    if (!getTurnSeat) return;
    for (const seat of candidateSeats) {
      const gameState = connections[seat]?.gameState;
      if (gameState == null) continue;
      const turnSeat = getTurnSeat(gameState as ViewOf<TConnection>);
      if (turnSeat && candidateSeats.includes(turnSeat) && turnSeat !== lastAppliedTurnSeatRef.current) {
        lastAppliedTurnSeatRef.current = turnSeat;
        setActiveSeat(turnSeat);
      }
      break;
    }
  }, [connections, candidateSeats, getTurnSeat]);

  return (
    <>
      {candidateSeats.map((seat) => (
        <HotseatSeatConnector key={seat} seat={seat} roomCode={roomCode} useActions={useActions} onConnection={handleConnection} />
      ))}

      {!allReady && <Centered>{anyError ?? 'Connecting…'}</Centered>}

      {allReady && (
        <div style={{ padding: 16 }}>
          <div className="panel" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, color: 'var(--muted)' }}>
              Hotseat — {getTurnSeat ? 'following the active turn (click to override):' : 'viewing:'}
            </strong>
            {candidateSeats.map((seat) => (
              <button
                key={seat}
                className={`btn ${!splitView && activeSeat === seat ? 'btn-primary' : ''}`}
                onClick={() => {
                  setActiveSeat(seat);
                  setSplitView(false);
                }}
              >
                {seatLabel(seat)}
              </button>
            ))}
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <input type="checkbox" checked={splitView} onChange={(e) => setSplitView(e.target.checked)} />
              Show all seats
            </label>
          </div>

          {splitView ? (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {candidateSeats.map((seat) => (
                <div key={seat} style={{ flex: '1 1 480px', minWidth: 0 }}>
                  <h3 style={{ marginTop: 0 }}>{seatLabel(seat)}</h3>
                  <GameView key={seat} roomCode={roomCode} connection={connections[seat]} />
                </div>
              ))}
            </div>
          ) : (
            <GameView key={activeSeat} roomCode={roomCode} connection={connections[activeSeat]} />
          )}
        </div>
      )}
    </>
  );
}
