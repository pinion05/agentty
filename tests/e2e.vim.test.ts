import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attachSession, resolveTargetSessionId } from '../src/resolveSession';
import { killSession, sendKey, sendText, startSession, type SessionMetadata } from '../src/sessionRuntime';

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

async function cleanupSession(session: SessionMetadata | undefined): Promise<void> {
  if (!session) {
    return;
  }

  const exited = await waitForProcessExit(session.pid, 100);

  if (!exited) {
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

describe('e2e: vim', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-e2e-vim-'));
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

  it('vim interaction works end-to-end', async () => {
    let session: SessionMetadata | undefined;

    try {
      session = await startSession({
        command: 'command -v vim >/dev/null 2>&1 && exec vim || exec vi',
        cwd: process.cwd(),
      });

      await attachSession(session.id);
      const targetSessionId = await resolveTargetSessionId();

      await sendKey(targetSessionId, 'i');
      await sendText(targetSessionId, 'hello');
      await sendKey(targetSessionId, 'Esc');
      await sendText(targetSessionId, ':q!');
      await sendKey(targetSessionId, 'Enter');

      const exited = await waitForProcessExit(session.pid, 5_000);

      if (!exited) {
        await killSession(session.id);
        expect(await waitForProcessExit(session.pid, 5_000)).toBe(true);
      }
    } finally {
      await cleanupSession(session);
    }
  });
});
