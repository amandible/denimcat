import { io, type Socket } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';

export function createSocket(namespace: string): Socket {
  return io(`${SERVER_URL}${namespace}`, { transports: ['websocket'] });
}
