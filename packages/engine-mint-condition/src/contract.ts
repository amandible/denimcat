import type { ActionResult, RoomLifecycleClientToServerEvents, RoomLifecycleServerToClientEvents } from '@denimcat/shared';
import type { GameState, Phase, PlayerCount, PriceSlot, PrizeCard, SeatId } from './types';

export interface MintConditionConfig {
  playerCount: PlayerCount;
}

/**
 * Unlike Hyper Bloom (no hidden information at all), Mint Condition has
 * real hidden info confirmed by the designer: blind draws from a shuffled
 * personal deck. `GameState` is never sent to clients directly — this is
 * the redacted view each viewer actually receives.
 */
export interface MintConditionPlayerView {
  seat: SeatId;
  handSize: number;
  /** Present only when this is the viewer's own seat. */
  hand?: number[];
  /** Deck contents/order are never revealed to anyone, including the owner (blind draws). */
  deckSize: number;
  wonPrizes: PrizeCard[];
}

export interface MintConditionAuctionView {
  openerSeat: SeatId;
  turnOrder: SeatId[];
  activeSeat: SeatId;
  /** Only the numeric amount is public; the specific committed cards stay hidden, matching a real verbal auction. */
  highestBid: { seat: SeatId; amount: number } | null;
  passedSeats: SeatId[];
  winnerSeat: SeatId | null;
}

export interface MintConditionStateView {
  seats: SeatId[];
  players: Record<SeatId, MintConditionPlayerView>;
  priceSlots: PriceSlot[];
  prizeDeckCount: number;
  /** Set once a prize is revealed (before the winner picks a slot for it) — public information. */
  revealedPrize: PrizeCard | null;
  phase: Phase;
  auction: MintConditionAuctionView;
  winner: SeatId[] | null;
}

/**
 * `viewer` is redacted the same way whether it's an opposing player or a
 * spectator — a player opening a second tab as "spectator" must not be able
 * to see every hand.
 */
export function toView(state: GameState, viewer: SeatId | 'spectator'): MintConditionStateView {
  const players = {} as Record<SeatId, MintConditionPlayerView>;
  for (const seat of state.seats) {
    const p = state.players[seat];
    const isOwner = viewer === seat;
    players[seat] = {
      seat,
      handSize: p.hand.length,
      hand: isOwner ? [...p.hand] : undefined,
      deckSize: p.deck.length,
      wonPrizes: p.wonPrizes.map((prize) => ({ ...prize })),
    };
  }

  return {
    seats: [...state.seats],
    players,
    priceSlots: state.priceSlots.map((slot) => ({ price: slot.price, prizes: slot.prizes.map((p) => ({ ...p })) })),
    prizeDeckCount: state.prizeDeck.length,
    revealedPrize: state.revealedPrize ? { ...state.revealedPrize } : null,
    phase: state.phase,
    auction: {
      openerSeat: state.auction.openerSeat,
      turnOrder: [...state.auction.turnOrder],
      activeSeat: state.auction.activeSeat,
      highestBid: state.auction.highestBid
        ? { seat: state.auction.highestBid.seat, amount: state.auction.highestBid.amount }
        : null,
      passedSeats: [...state.auction.passedSeats],
      winnerSeat: state.auction.winnerSeat,
    },
    winner: state.winner ? [...state.winner] : null,
  };
}

export interface ClientToServerEvents
  extends RoomLifecycleClientToServerEvents<SeatId, MintConditionConfig, MintConditionStateView> {
  place_bid: (payload: { roomCode: string; cards: number[] }, cb: (res: ActionResult) => void) => void;
  pass: (payload: { roomCode: string }, cb: (res: ActionResult) => void) => void;
  take_prize: (payload: { roomCode: string; prizeId: string }, cb: (res: ActionResult) => void) => void;
  skip_prize_choice: (payload: { roomCode: string }, cb: (res: ActionResult) => void) => void;
  place_new_prize: (payload: { roomCode: string; slotIndex: number }, cb: (res: ActionResult) => void) => void;
}

export type ServerToClientEvents = RoomLifecycleServerToClientEvents<SeatId, MintConditionStateView>;
