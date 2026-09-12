import type { Namespace, Socket } from 'socket.io';
import type { RoomStore } from '../rooms/roomStore';
import type { GameModule } from '../gameModule';
import { registerRoomHandlers } from './roomHandlers';

export function attachSocketHandlers<TState, TConfig, TSeat extends string>(
  nsp: Namespace,
  store: RoomStore<TState, TConfig, TSeat>,
  module: GameModule<TState, TConfig, TSeat>,
): void {
  nsp.on('connection', (socket: Socket) => {
    registerRoomHandlers(socket, store);
    module.registerHandlers(socket, store);
    socket.on('disconnect', () => {
      store.handleDisconnect(socket.id).catch((error) => {
        console.error(`[socket:${module.id}] handleDisconnect failed:`, error);
      });
    });
  });
}
