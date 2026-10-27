import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createAuthService, InMemoryAuthRepository, type AuthService, type EmailSender } from '@denimcat/platform';
import { createApp } from '../src/app';

function fakeEmailSender(): EmailSender & { calls: { to: string; subject: string; text: string }[] } {
  const calls: { to: string; subject: string; text: string }[] = [];
  return {
    calls,
    async send(to, subject, text) {
      calls.push({ to, subject, text });
    },
  };
}

describe('auth HTTP routes', () => {
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  let authService: AuthService;
  let sender: ReturnType<typeof fakeEmailSender>;

  beforeEach(async () => {
    sender = fakeEmailSender();
    authService = createAuthService(new InMemoryAuthRepository(), sender, 'https://denimcat.example', 'owner@example.com');
    const app = createApp({ authService, clientOrigins: [] });
    httpServer = createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function requestLink(email: unknown) {
    return fetch(`${baseUrl}/auth/request-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then((r) => r.json());
  }

  function verify(token: unknown) {
    return fetch(`${baseUrl}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then((r) => r.json());
  }

  function session(token?: string) {
    return fetch(`${baseUrl}/auth/session`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then((r) => r.json());
  }

  function signOut(token?: string) {
    return fetch(`${baseUrl}/auth/sign-out`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then((r) => r.json());
  }

  function updateProfile(token: string | undefined, displayName: unknown, turnChimeEnabled: unknown = true) {
    return fetch(`${baseUrl}/auth/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ displayName, turnChimeEnabled }),
    }).then((r) => r.json());
  }

  function linkFromSender(to: string): string {
    const email = sender.calls.find((c) => c.to === to && c.subject === 'Your denimcat sign-in link');
    const match = email?.text.match(/token=([^\s]+)/);
    if (!match) throw new Error(`no sign-in link found for ${to}`);
    return decodeURIComponent(match[1]);
  }

  it('a brand-new email gets {ok:true}, a sign-in link, AND an owner notification', async () => {
    const result = await requestLink('new@example.com');
    expect(result).toEqual({ ok: true });
    expect(sender.calls.some((c) => c.to === 'new@example.com' && c.subject === 'Your denimcat sign-in link')).toBe(true);
    expect(sender.calls.some((c) => c.to === 'owner@example.com' && c.subject === 'New denimcat account')).toBe(true);
  });

  it('requesting again for the same email sends another link but does not re-notify the owner', async () => {
    await requestLink('returning@example.com');
    sender.calls.length = 0;
    const result = await requestLink('returning@example.com');
    expect(result).toEqual({ ok: true });
    expect(sender.calls.some((c) => c.to === 'returning@example.com')).toBe(true);
    expect(sender.calls.some((c) => c.subject === 'New denimcat account')).toBe(false);
  });

  it('a malformed address returns {ok:true} but sends nothing', async () => {
    const result = await requestLink('not-an-email');
    expect(result).toEqual({ ok: true });
    expect(sender.calls).toHaveLength(0);
  });

  it('stops sending further links past the per-hour rate limit for one email', async () => {
    for (let i = 0; i < 5; i++) await requestLink('spammed@example.com');
    expect(sender.calls.filter((c) => c.to === 'spammed@example.com')).toHaveLength(5);
    const result = await requestLink('spammed@example.com');
    expect(result).toEqual({ ok: true });
    expect(sender.calls.filter((c) => c.to === 'spammed@example.com')).toHaveLength(5);
  });

  it('a token verifies successfully once, fails on replay, and a garbage token fails', async () => {
    await requestLink('alice@example.com');
    const token = linkFromSender('alice@example.com');

    const first = await verify(token);
    expect(first.ok).toBe(true);
    expect(typeof first.sessionToken).toBe('string');

    const second = await verify(token);
    expect(second).toEqual({ ok: false });

    expect(await verify('garbage')).toEqual({ ok: false });
  });

  it('/auth/session round-trips a valid token and rejects missing/malformed/stale ones', async () => {
    await requestLink('alice@example.com');
    const token = linkFromSender('alice@example.com');
    const { sessionToken } = await verify(token);

    expect(await session(sessionToken)).toEqual({ ok: true, email: 'alice@example.com', displayName: null, turnChimeEnabled: true, isOwner: false });
    expect(await session()).toEqual({ ok: false });
    expect(await session('garbage')).toEqual({ ok: false });
  });

  it('isOwner is true for the configured OWNER_EMAIL and false for anyone else, on both /auth/verify and /auth/session', async () => {
    await requestLink('owner@example.com');
    const ownerVerify = await verify(linkFromSender('owner@example.com'));
    expect(ownerVerify.isOwner).toBe(true);
    expect(await session(ownerVerify.sessionToken)).toMatchObject({ isOwner: true });

    await requestLink('alice@example.com');
    const aliceVerify = await verify(linkFromSender('alice@example.com'));
    expect(aliceVerify.isOwner).toBe(false);
    expect(await session(aliceVerify.sessionToken)).toMatchObject({ isOwner: false });
  });

  it('sign-out then session confirms the session is gone', async () => {
    await requestLink('alice@example.com');
    const token = linkFromSender('alice@example.com');
    const { sessionToken } = await verify(token);

    expect(await signOut(sessionToken)).toEqual({ ok: true });
    expect(await session(sessionToken)).toEqual({ ok: false });
  });

  it('saving a display name is reflected in a later /auth/session call', async () => {
    await requestLink('alice@example.com');
    const token = linkFromSender('alice@example.com');
    const { sessionToken } = await verify(token);

    expect(await updateProfile(sessionToken, 'Alice')).toEqual({ ok: true, displayName: 'Alice', turnChimeEnabled: true });
    expect(await session(sessionToken)).toEqual({ ok: true, email: 'alice@example.com', displayName: 'Alice', turnChimeEnabled: true, isOwner: false });
  });

  it('trims a display name and caps it at 40 characters', async () => {
    await requestLink('alice@example.com');
    const { sessionToken } = await verify(linkFromSender('alice@example.com'));

    const result = await updateProfile(sessionToken, `  ${'x'.repeat(50)}  `);
    expect(result).toEqual({ ok: true, displayName: 'x'.repeat(40), turnChimeEnabled: true });
  });

  it('saving turnChimeEnabled is reflected in a later /auth/session call, defaulting to true', async () => {
    await requestLink('alice@example.com');
    const { sessionToken } = await verify(linkFromSender('alice@example.com'));

    // Defaults to true before anyone ever saves the form.
    expect(await session(sessionToken)).toMatchObject({ turnChimeEnabled: true });

    expect(await updateProfile(sessionToken, 'Alice', false)).toEqual({ ok: true, displayName: 'Alice', turnChimeEnabled: false });
    expect(await session(sessionToken)).toMatchObject({ turnChimeEnabled: false });

    expect(await updateProfile(sessionToken, 'Alice', true)).toEqual({ ok: true, displayName: 'Alice', turnChimeEnabled: true });
    expect(await session(sessionToken)).toMatchObject({ turnChimeEnabled: true });
  });

  it('rejects an update with no/invalid session token, or a non-boolean turnChimeEnabled', async () => {
    expect(await updateProfile(undefined, 'Alice')).toEqual({ ok: false });
    expect(await updateProfile('garbage', 'Alice')).toEqual({ ok: false });

    await requestLink('alice@example.com');
    const { sessionToken } = await verify(linkFromSender('alice@example.com'));
    expect(await updateProfile(sessionToken, 'Alice', 'not-a-boolean')).toEqual({ ok: false });
  });
});

describe('Socket.IO rejection via the parent-namespace auth middleware', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let repo: InMemoryAuthRepository;
  let baseUrl: string;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    repo = new InMemoryAuthRepository();
    await repo.createSession('alice@example.com', 'valid-session-token', Date.now() + 10_000);

    httpServer = createServer();
    io = new Server(httpServer);
    // The exact mechanism index.ts registers in production — a regex
    // "parent namespace" middleware, applied before any real namespace is
    // created, so later plain-string namespaces inherit it automatically.
    io.of(/^\/.+$/).use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) return next(new Error('unauthorized'));
      const found = await repo.getSession(token);
      if (!found) return next(new Error('unauthorized'));
      next();
    });
    const nsp = io.of('/dummy');
    nsp.on('connection', (socket) => socket.emit('welcome'));

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const port = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}/dummy`;
  });

  afterEach(async () => {
    for (const c of clients) c.close();
    clients = [];
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(auth?: { token: string }): ClientSocket {
    const socket = ioc(baseUrl, { transports: ['websocket'], auth, reconnection: false });
    clients.push(socket);
    return socket;
  }

  it('rejects a connection with no auth token', async () => {
    const socket = connect();
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('rejects a connection with a garbage token', async () => {
    const socket = connect({ token: 'garbage' });
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('unauthorized');
  });

  it('accepts a connection with a valid session token, and the namespace connection handler runs', async () => {
    const socket = connect({ token: 'valid-session-token' });
    const welcome = await new Promise<void>((resolve, reject) => {
      socket.on('welcome', () => resolve());
      socket.on('connect_error', (err) => reject(err));
    });
    expect(welcome).toBeUndefined();
  });
});
