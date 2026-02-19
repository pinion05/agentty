import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attachSession, resolveTargetSessionId } from '../src/resolveSession';
import { getSnapshot, killSession, sendKey, sendText, startSession, type SessionMetadata } from '../src/sessionRuntime';

async function waitForProcessExit(pid: number, timeoutMs = 5_000): Promise<boolean> {
  const intervalMs = 50;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return true;
      }

      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

async function waitForSnapshotContains(sessionId: string, needle: RegExp): Promise<string> {
  const timeoutMs = 8_000;
  const intervalMs = 50;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await getSnapshot(sessionId, 200);

    if (needle.test(snapshot)) {
      return snapshot;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for snapshot to match ${needle}`);
}

async function cleanupSession(session: SessionMetadata | undefined): Promise<void> {
  if (!session) {
    return;
  }

  const stillRunning = await waitForProcessExit(session.pid, 100);

  if (!stillRunning) {
    try {
      await killSession(session.id);
    } catch {
      try {
        process.kill(session.pid, 'SIGKILL');
      } catch {
        // already exited
      }
    }

    await waitForProcessExit(session.pid, 2_000);
  }
}

describe('e2e: python repl', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-e2e-python-'));
    process.env.AGENTTY_HOME = tempHome;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.AGENTTY_HOME;
    } else {
      process.env.AGENTTY_HOME = originalEnv;
    }

    await rm(tempHome, { recursive: true, force: true });
  });

  it('python repl interaction works end-to-end', async () => {
    let session: SessionMetadata | undefined;

    try {
      session = await startSession({
        command: 'python3 -i',
        cwd: process.cwd(),
      });

      await attachSession(session.id);
      const targetSessionId = await resolveTargetSessionId();

      await sendText(targetSessionId, 'print(2+2)');
      await sendKey(targetSessionId, 'Enter');

      const snapshot = await waitForSnapshotContains(targetSessionId, /(^|\n)4(\n|$)/);
      expect(snapshot).toContain('4');

      await sendKey(targetSessionId, 'Ctrl+D');

      const exited = await waitForProcessExit(session.pid, 2_000);

      if (!exited) {
        await killSession(session.id);
        expect(await waitForProcessExit(session.pid, 5_000)).toBe(true);
      }
    } finally {
      await cleanupSession(session);
    }
  });
});
