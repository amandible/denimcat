import { useState } from 'react';
import { eligibleTakeSlotIndex, slotIndexForBid, type SeatId } from '@denimcat/engine-mint-condition';
import type { MintConditionConnection } from './useMintConditionActions';
import { PriceSlotTrack } from './components/PriceSlotTrack';
import { AuctionStatusPanel } from './components/AuctionStatusPanel';
import { YourHand } from './components/YourHand';
import { BidOptionsList } from './components/BidOptionsList';
import { PassButton } from './components/PassButton';
import { PrizeChoicePanel } from './components/PrizeChoicePanel';
import { NewPrizeSlotPicker } from './components/NewPrizeSlotPicker';
import { ScoreBoard } from './components/ScoreBoard';
import { PlayerCounts } from './components/PlayerCounts';
import { RulesContent } from './components/RulesContent';
import { RulesModal } from '../../components/RulesModal';
import { ActivityPanel } from '../../components/ActivityPanel';
import { RecapPanel } from '../../components/RecapPanel';
import { seatLabel } from './seats';

export function GameView({ roomCode, connection }: { roomCode: string; connection: MintConditionConnection }) {
  const { gameState, you } = connection;
  const [showRules, setShowRules] = useState(false);
  const [hoveredBidAmount, setHoveredBidAmount] = useState<number | null>(null);
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

  // Both post-auction choices (which prize to take, where to place the new
  // one) now act directly on the main board's own PriceSlotTrack instead of
  // showing a second copy of it in the side panel — one source of truth for
  // "click here," not a board plus a redundant mini-board beside it.
  const highestBidAmount = gameState.auction.highestBid?.amount;
  const showingPrizeChoice = !!mySeat && isWinner && gameState.phase === 'awaiting-prize-choice' && highestBidAmount !== undefined;
  const eligibleSlotIndex = showingPrizeChoice ? eligibleTakeSlotIndex(gameState.priceSlots, highestBidAmount!) : null;

  // A hover preview during bidding itself — reuses the same slotIndexForBid
  // lookup the engine actually bids against, so what you see hovering a
  // bid option is exactly where that bid would land. Gated on isMyTurn so
  // a stale hover value (BidOptionsList unmounting without a mouseleave,
  // e.g. the turn changing mid-hover) can never highlight a slot outside
  // the one phase this preview applies to.
  const hoveredSlotIndex =
    isMyTurn && hoveredBidAmount !== null ? (slotIndexForBid(gameState.priceSlots, hoveredBidAmount) ?? undefined) : undefined;

  const showingPlacement = !!mySeat && isWinner && gameState.phase === 'awaiting-new-prize-placement' && !!gameState.revealedPrize;
  const lastSlotIndex = gameState.priceSlots.length - 1;
  const upperSlotIndices = new Set([lastSlotIndex - 1, lastSlotIndex]);
  const placeableSlots = showingPlacement
    ? new Set(
        gameState.priceSlots.map((_, i) => i).filter((i) => !upperSlotIndices.has(i) || gameState.unlockedUpperSlots.includes(i)),
      )
    : undefined;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', gap: 28, flexWrap: 'wrap' }}>
      <div style={{ flex: '2 1 420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ marginBottom: 10 }}>Room {roomCode}</h2>
          <button className="btn" onClick={() => setShowRules(true)}>
            Rules
          </button>
        </div>
        <PriceSlotTrack
          slots={gameState.priceSlots}
          eligibleSlotIndex={eligibleSlotIndex ?? undefined}
          hoveredSlotIndex={hoveredSlotIndex}
          onPrizeClick={showingPrizeChoice ? (prizeId) => connection.takePrize(prizeId) : undefined}
          placeableSlots={placeableSlots}
          onPlaceInSlot={showingPlacement ? (slotIndex) => connection.placeNewPrize(slotIndex) : undefined}
        />
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

        <PlayerCounts state={gameState} />

        {mySeat && <YourHand hand={myHand} />}

        {mySeat && isMyTurn && (
          <div style={{ marginTop: 16 }}>
            <h3>Your move</h3>
            <BidOptionsList
              hand={myHand}
              currentBidAmount={gameState.auction.highestBid?.amount ?? 0}
              onBid={(cards) => connection.placeBid(cards)}
              onHoverAmount={setHoveredBidAmount}
            />
            <div style={{ marginTop: 8 }}>
              <PassButton onPass={() => connection.pass()} />
            </div>
          </div>
        )}

        {showingPrizeChoice && (
          <div style={{ marginTop: 16 }}>
            <PrizeChoicePanel
              bidAmount={highestBidAmount!}
              hasEligiblePrize={eligibleSlotIndex !== null}
              onChooseReward={(reward) => connection.chooseAuctionReward(reward)}
            />
          </div>
        )}

        {showingPlacement && (
          <div style={{ marginTop: 16 }}>
            <NewPrizeSlotPicker revealedPrize={gameState.revealedPrize!} />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <ScoreBoard state={gameState} />
        </div>

        {gameState.phase === 'ended' && mySeat && (
          <div style={{ marginTop: 16 }}>
            <RecapPanel
              gameId="mint-condition"
              roomCode={roomCode}
              mySeat={mySeat}
              resultSummary={
                <p style={{ margin: 0 }}>
                  {gameState.winner && gameState.winner.length > 1
                    ? `Shared win: ${gameState.winner.map(seatLabel).join(' & ')}!`
                    : `${gameState.winner ? seatLabel(gameState.winner[0]) : ''} wins!`}
                </p>
              }
            />
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <ActivityPanel
            log={gameState.log}
            chatMessages={connection.roomInfo?.chatMessages ?? []}
            onSend={(text) => connection.sendAction('send_chat', { text, afterLogIndex: gameState.log.length })}
            seatLabel={seatLabel as (seat: string) => string}
          />
        </div>

        {connection.lastError && <p style={{ color: 'crimson' }}>{connection.lastError}</p>}
      </div>

      {showRules && (
        <RulesModal onClose={() => setShowRules(false)}>
          <RulesContent />
        </RulesModal>
      )}
    </main>
  );
}
