import type { SeatId } from '@denimcat/engine-mint-condition';
import type { MintConditionConnection } from './useMintConditionActions';
import { PriceSlotTrack } from './components/PriceSlotTrack';
import { AuctionStatusPanel } from './components/AuctionStatusPanel';
import { YourHand } from './components/YourHand';
import { BidOptionsList } from './components/BidOptionsList';
import { PassButton } from './components/PassButton';
import { PrizeChoicePanel } from './components/PrizeChoicePanel';
import { NewPrizeSlotPicker } from './components/NewPrizeSlotPicker';
import { ScoreBoard } from './components/ScoreBoard';
import { seatLabel } from './seats';

export function GameView({ roomCode, connection }: { roomCode: string; connection: MintConditionConnection }) {
  const { gameState, you } = connection;
  if (!gameState || !you) return null;

  const mySeat = you.role !== 'spectator' ? (you.role as SeatId) : null;
  // Whoever needs to act next: the active bidder during a live auction, or
  // the winner during the two post-auction phases (choosing/placing a
  // prize) — the game is just as much "waiting on someone" there as it is
  // mid-auction, even though nobody's placing a bid.
  const pendingSeat: SeatId | null =
    gameState.phase === 'auction-active'
      ? gameState.auction.activeSeat
      : gameState.phase === 'awaiting-prize-choice' || gameState.phase === 'awaiting-new-prize-placement'
        ? gameState.auction.winnerSeat
        : null;
  const isMyTurn = !!mySeat && gameState.phase === 'auction-active' && gameState.auction.activeSeat === mySeat;
  const isWinner = !!mySeat && gameState.auction.winnerSeat === mySeat;
  const myHand = mySeat ? gameState.players[mySeat].hand ?? [] : [];

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
      <div style={{ flex: '2 1 420px' }}>
        <h2 style={{ marginBottom: 10 }}>Room {roomCode}</h2>
        <PriceSlotTrack slots={gameState.priceSlots} />
        <div style={{ marginTop: 16 }}>
          <AuctionStatusPanel auction={gameState.auction} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>Prizes left to reveal: {gameState.prizeDeckCount}</p>
      </div>

      <div className="panel" style={{ flex: '1 1 260px', height: 'fit-content' }}>
        <p style={{ marginTop: 0 }}>
          You are <strong>{you.role === 'spectator' ? 'a spectator' : seatLabel(mySeat as SeatId)}</strong>
          {mySeat && pendingSeat && (
            <> — {pendingSeat === mySeat ? "it's your turn" : `waiting on ${seatLabel(pendingSeat)}`}</>
          )}
        </p>

        {mySeat && <YourHand hand={myHand} />}

        {mySeat && isMyTurn && (
          <div style={{ marginTop: 16 }}>
            <h3>Your move</h3>
            <BidOptionsList
              hand={myHand}
              currentBidAmount={gameState.auction.highestBid?.amount ?? 0}
              onBid={(cards) => connection.placeBid(cards)}
            />
            <div style={{ marginTop: 8 }}>
              <PassButton onPass={() => connection.pass()} />
            </div>
          </div>
        )}

        {mySeat && isWinner && gameState.phase === 'awaiting-prize-choice' && gameState.auction.highestBid && (
          <div style={{ marginTop: 16 }}>
            <PrizeChoicePanel
              priceSlots={gameState.priceSlots}
              bidAmount={gameState.auction.highestBid.amount}
              onTakePrize={(prizeId) => connection.takePrize(prizeId)}
              onSkip={() => connection.skipPrizeChoice()}
            />
          </div>
        )}

        {mySeat && isWinner && gameState.phase === 'awaiting-new-prize-placement' && gameState.revealedPrize && (
          <div style={{ marginTop: 16 }}>
            <NewPrizeSlotPicker
              revealedPrize={gameState.revealedPrize}
              priceSlots={gameState.priceSlots}
              unlockedUpperSlots={gameState.unlockedUpperSlots}
              onPlace={(slotIndex) => connection.placeNewPrize(slotIndex)}
            />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <ScoreBoard state={gameState} />
        </div>

        {connection.lastError && <p style={{ color: 'crimson' }}>{connection.lastError}</p>}
      </div>
    </main>
  );
}
