import { describe, expect, it } from 'vitest';
import { InMemoryAuthRepository } from '../src/auth/authRepository';

describe('getOrCreateAccount', () => {
  it('reports isNew: true the first time an email is seen, and false on every call after', async () => {
    const repo = new InMemoryAuthRepository();
    const first = await repo.getOrCreateAccount('alice@example.com');
    expect(first).toEqual({ email: 'alice@example.com', isNew: true });
    const second = await repo.getOrCreateAccount('alice@example.com');
    expect(second).toEqual({ email: 'alice@example.com', isNew: false });
  });

  it('normalizes case and whitespace so the same person is recognized either way', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.getOrCreateAccount('Alice@Example.com');
    const result = await repo.getOrCreateAccount('  alice@example.com  ');
    expect(result).toEqual({ email: 'alice@example.com', isNew: false });
  });
});

describe('countRecentMagicLinks', () => {
  it('only counts links created within the window', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.createMagicLink('alice@example.com', 'tok-1', Date.now() + 10_000);
    expect(await repo.countRecentMagicLinks('alice@example.com', 60 * 60 * 1000)).toBe(1);
    expect(await repo.countRecentMagicLinks('bob@example.com', 60 * 60 * 1000)).toBe(0);
  });
});

describe('consumeMagicLink', () => {
  it('succeeds once for a fresh, unexpired token', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.createMagicLink('alice@example.com', 'tok-1', Date.now() + 10_000);
    const result = await repo.consumeMagicLink('tok-1');
    expect(result).toEqual({ email: 'alice@example.com' });
  });

  it('fails on replay (single-use)', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.createMagicLink('alice@example.com', 'tok-1', Date.now() + 10_000);
    await repo.consumeMagicLink('tok-1');
    const second = await repo.consumeMagicLink('tok-1');
    expect(second).toBeNull();
  });

  it('fails for an expired token', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.createMagicLink('alice@example.com', 'tok-1', Date.now() - 1000);
    expect(await repo.consumeMagicLink('tok-1')).toBeNull();
  });

  it('fails for a never-issued token', async () => {
    const repo = new InMemoryAuthRepository();
    expect(await repo.consumeMagicLink('nonexistent')).toBeNull();
  });
});

describe('sessions', () => {
  it('getSession returns the email for a valid, unexpired token', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.createSession('alice@example.com', 'sess-1', Date.now() + 10_000);
    expect(await repo.getSession('sess-1')).toEqual({ email: 'alice@example.com' });
  });

  it('getSession returns null for an expired token', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.createSession('alice@example.com', 'sess-1', Date.now() - 1000);
    expect(await repo.getSession('sess-1')).toBeNull();
  });

  it('getSession returns null for a nonexistent token', async () => {
    const repo = new InMemoryAuthRepository();
    expect(await repo.getSession('nonexistent')).toBeNull();
  });

  it('deleteSession makes a later getSession return null, and is a no-op for a nonexistent token', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.createSession('alice@example.com', 'sess-1', Date.now() + 10_000);
    await repo.deleteSession('sess-1');
    expect(await repo.getSession('sess-1')).toBeNull();
    await expect(repo.deleteSession('nonexistent')).resolves.toBeUndefined();
  });
});

describe('display name', () => {
  it('is null before any account exists or any name is set', async () => {
    const repo = new InMemoryAuthRepository();
    expect(await repo.getDisplayName('alice@example.com')).toBeNull();
    await repo.getOrCreateAccount('alice@example.com');
    expect(await repo.getDisplayName('alice@example.com')).toBeNull();
  });

  it('setDisplayName persists and is readable by a differently-cased email', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.getOrCreateAccount('alice@example.com');
    await repo.setDisplayName('Alice@Example.com', 'Alice');
    expect(await repo.getDisplayName('  alice@example.com  ')).toBe('Alice');
  });

  it('setDisplayName creates the account row if one does not already exist', async () => {
    const repo = new InMemoryAuthRepository();
    await repo.setDisplayName('bob@example.com', 'Bob');
    expect(await repo.getDisplayName('bob@example.com')).toBe('Bob');
  });
});
