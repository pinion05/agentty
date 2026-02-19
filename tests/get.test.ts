import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startSession, getSnapshot } from '../src/sessionRuntime';
import { writeActiveSessionId } from '../src/state';

async function waitForSnapshotContains(sessionId: string, needle: string): Promise<void> {
  const timeoutMs = 5_000;
  const intervalMs = 50;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const snapshot = await getSnapshot(sessionId);

    if (snapshot.includes(needle)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${needle} in snapshot`);
}

describe('get snapshot', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-get-test-'));
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

  it('getSnapshot returns text tail only with line limit', async () => {
    let pid: number | undefined;

    try {
      const session = await startSession({
        command: "printf 'line-1\\r\\nline-2\\r\\nline-3\\r\\nline-4\\r\\n'; sleep 30",
        cwd: process.cwd(),
      });

      pid = session.pid;

      await waitForSnapshotContains(session.id, 'line-4');

      await expect(getSnapshot(session.id, 3)).resolves.toBe('line-2\nline-3\nline-4');
    } finally {
      if (pid !== undefined) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // already exited
        }
      }
    }
  });

  it('agentty get resolves attached session id', async () => {
    await writeActiveSessionId('active-session');

    const result = await execa('node', ['dist/index.js', 'get', '--lines', '5'], {
      env: {
        ...process.env,
        AGENTTY_HOME: tempHome,
      },
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('session is not running: active-session');
  });
});
