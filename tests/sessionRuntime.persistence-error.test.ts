import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sessionRuntime.startSession cleanup on persistence failure', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('preserves the original writeSessions error when kill throws', async () => {
    const persistenceError = new Error('writeSessions failed');
    const killMock = vi.fn(() => {
      throw new Error('kill failed');
    });
    const spawnMock = vi.fn(() => ({
      pid: 12345,
      onExit: vi.fn(),
      kill: killMock,
    }));

    const readSessionsMock = vi.fn(async () => []);
    const writeSessionsMock = vi.fn(async () => {
      throw persistenceError;
    });

    vi.doMock('node-pty', () => ({
      spawn: spawnMock,
    }));

    vi.doMock('../src/state', () => ({
      readSessions: readSessionsMock,
      writeSessions: writeSessionsMock,
    }));

    const { startSession } = await import('../src/sessionRuntime');

    await expect(startSession({ command: 'echo hello', cwd: process.cwd() })).rejects.toBe(
      persistenceError,
    );

    expect(writeSessionsMock).toHaveBeenCalledTimes(1);
    expect(killMock).toHaveBeenCalledTimes(1);
  });
});
