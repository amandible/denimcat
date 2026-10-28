import type { SeatId } from '@denimcat/engine-detour';

const CELL_SIZE = 48;
const CELL_GAP = 4;

/** Same 5-col x 4-row rectangle minus the top-right and bottom-left cells as the engine's board.ts — the server sends only Record<CellId, CellState>, never shape, so this is reconstructed client-side. */
const BOARD_CELLS: string[] = (() => {
  const cells: string[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 0 && col === 4) continue;
      if (row === 3 && col === 0) continue;
      cells.push(`${row}-${col}`);
    }
  }
  return cells;
})();

/** Literal hex, not CSS vars — Detour has no dedicated stylesheet and seats are positions (Player 1-4), not colors, so there's no existing palette to reuse. Matches King's Gate's ScoreBoard.tsx convention for a game in the same situation. */
const OWNER_COLORS: Record<SeatId, string> = {
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
  canPlay,
  onCellClick,
}: {
  cells: Record<string, CellView>;
  pawnCell: string;
  /** Whether a card is currently selected and it's the viewer's turn — gates click handling, not just visuals. */
  canPlay: boolean;
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
          const ownerColor = cell && cell.owner !== 'neutral' ? OWNER_COLORS[cell.owner as SeatId] : 'var(--border)';
          return (
            <button
              key={cellId}
              onClick={() => canPlay && onCellClick(cellId)}
              disabled={!canPlay}
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                width: CELL_SIZE,
                height: CELL_SIZE,
                border: `2px solid ${ownerColor}`,
                borderRadius: 6,
                background: isPawn ? 'var(--accent)' : 'var(--panel-bg)',
                color: isPawn ? 'white' : 'var(--text)',
                fontWeight: 'bold',
                fontSize: 15,
                cursor: canPlay ? 'pointer' : 'default',
                padding: 0,
              }}
              title={cell ? `${cell.value}${cell.owner !== 'neutral' ? ` (${cell.owner})` : ''}` : undefined}
            >
              {cell?.value ?? ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}
