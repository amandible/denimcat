import { BOARD_CELLS, directionFor, type DeckId, type SeatId } from '@denimcat/engine-detour';
import { ARROW_GLYPHS } from '../arrows';

const CELL_SIZE = 48;
const CELL_GAP = 4;

/** Literal hex, not CSS vars — Detour has no dedicated stylesheet and seats are positions (Player 1-4), not colors, so there's no existing palette to reuse. Matches King's Gate's ScoreBoard.tsx convention for a game in the same situation. */
export const OWNER_COLORS: Record<SeatId, string> = {
  p1: '#c62828',
  p2: '#1a237e',
  p3: '#8a6d00',
  p4: '#2b6b2b',
};

interface CellView {
  value: number;
  owner: SeatId | 'neutral';
}

export function Board({
  cells,
  pawnCell,
  deckIdOf,
  displayLabel,
  canPlay,
  legalCells,
  onCellClick,
}: {
  cells: Record<string, CellView>;
  pawnCell: string;
  /** Resolves an owning seat to its assigned deck, so an owned cell's arrow can be shown — neutral cells have no arrow (see directionFor's doc comment; never called for them). */
  deckIdOf: (seat: SeatId) => DeckId;
  displayLabel: (seat: SeatId) => string;
  /** Whether a card is currently selected and it's the viewer's turn — gates click handling, not just visuals. */
  canPlay: boolean;
  /** Cell ids the selected card may legally be played on. Undefined (no card selected) shows no highlighting. */
  legalCells?: Set<string>;
  onCellClick: (cellId: string) => void;
}) {
  return (
    <div className="panel" style={{ display: 'inline-block', padding: 12 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(5, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(4, ${CELL_SIZE}px)`,
          gap: CELL_GAP,
        }}
      >
        {BOARD_CELLS.map((cellId) => {
          const [row, col] = cellId.split('-').map(Number);
          const cell = cells[cellId];
          const isPawn = cellId === pawnCell;
          const owned = cell && cell.owner !== 'neutral' ? (cell.owner as SeatId) : null;
          const ownerColor = owned ? OWNER_COLORS[owned] : 'var(--border)';
          const arrow = owned && cell ? ARROW_GLYPHS[directionFor(deckIdOf(owned), cell.value)] : null;
          const isLegal = !!legalCells?.has(cellId);
          const clickable = canPlay && (!legalCells || isLegal);
          return (
            <button
              key={cellId}
              onClick={() => clickable && onCellClick(cellId)}
              disabled={!clickable}
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                width: CELL_SIZE,
                height: CELL_SIZE,
                border: `2px solid ${ownerColor}`,
                borderRadius: 6,
                boxShadow: isLegal ? '0 0 0 3px rgba(43,138,62,0.55)' : 'none',
                background: isPawn ? 'var(--accent)' : 'var(--panel-bg)',
                color: isPawn ? 'white' : 'var(--text)',
                fontWeight: 'bold',
                fontSize: 14,
                lineHeight: 1.1,
                cursor: clickable ? 'pointer' : 'default',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={cell ? (owned ? `${cell.value} — ${displayLabel(owned)}` : `${cell.value}`) : undefined}
            >
              <span>{cell?.value ?? ''}</span>
              {arrow && <span style={{ fontSize: 12, opacity: 0.8 }}>{arrow}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
