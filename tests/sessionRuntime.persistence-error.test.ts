import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sessionRuntime.startSession cleanup on persistence failure', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('preserves the original upsertSession error when process.kill throws', async () => {
    const persistenceError = new Error('upsertSession failed');
    const unrefMock = vi.fn();
    const spawnMock = vi.fn(() => ({
      pid: 12345,
      unref: unrefMock,
    }));

    vi.doMock('node:child_process', () => ({
      spawn: spawnMock,
    }));

    vi.doMock('../src/state', () => ({
      getSessionSocketPath: vi.fn(() => '/tmp/mock.sock'),
      upsertSession: vi.fn(async () => {
        throw persistenceError;
      }),
      readSessionById: vi.fn(),
      readActiveSessionId: vi.fn(),
      writeActiveSessionId: vi.fn(),
    }));

    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('kill failed');
    });

    const { startSession } = await import('../src/sessionRuntime');

    await expect(startSession({ command: 'echo hello', cwd: process.cwd() })).rejects.toBe(
      persistenceError,
    );

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
  });
});
