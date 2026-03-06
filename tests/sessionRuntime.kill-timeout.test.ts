import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('sessionRuntime.killSession timeout handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('rejects when the session does not exit before the timeout', async () => {
    vi.useFakeTimers();

    const writeActiveSessionIdMock = vi.fn();

    vi.doMock('../src/ipc', () => ({
      requestIpc: vi.fn(async () => true),
    }));

    vi.doMock('../src/state', () => ({
      readSessionById: vi.fn(async (sessionId: string) => ({
        id: sessionId,
        status: 'running',
        socketPath: '/tmp/mock.sock',
      })),
      readActiveSessionId: vi.fn(async () => 'session-timeout'),
      writeActiveSessionId: writeActiveSessionIdMock,
      upsertSession: vi.fn(),
      getSessionSocketPath: vi.fn(),
      getStateRoot: vi.fn(),
    }));

    const { killSession } = await import('../src/sessionRuntime');

    const killPromise = killSession('session-timeout');
    const capturedError = killPromise.catch((error) => error);
    await vi.advanceTimersByTimeAsync(3_500);

    await expect(capturedError).resolves.toMatchObject({
      message: 'session did not exit within 3000ms: session-timeout',
    });
    expect(writeActiveSessionIdMock).not.toHaveBeenCalled();
  });
});
