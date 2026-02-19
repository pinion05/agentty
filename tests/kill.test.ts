import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSnapshot, killSession, startSession } from '../src/sessionRuntime';
import { readActiveSessionId, readSessions, writeActiveSessionId } from '../src/state';

async function waitForProcessExit(pid: number): Promise<void> {
  const timeoutMs = 5_000;
  const intervalMs = 50;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return;
      }

      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for process ${pid} to exit`);
}

describe('kill lifecycle', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-kill-test-'));
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

  it('kill terminates session, updates metadata, and clears active pointer', async () => {
    const session = await startSession({
      command: 'sleep 30',
      cwd: process.cwd(),
    });

    await writeActiveSessionId(session.id);

    await killSession(session.id);
    await waitForProcessExit(session.pid);

    const sessions = await readSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: session.id,
      status: 'exited',
      command: 'sleep 30',
    });
    const exitCode = (sessions[0] as { exitCode?: unknown }).exitCode;
    expect(exitCode === null || typeof exitCode === 'number').toBe(true);
    expect(new Date((sessions[0] as { lastActiveAt: string }).lastActiveAt).getTime()).toBeGreaterThanOrEqual(
      new Date(session.startedAt).getTime(),
    );

    await expect(getSnapshot(session.id)).rejects.toThrow(`session is not running: ${session.id}`);
    await expect(readActiveSessionId()).resolves.toBeNull();
  });

  it('agentty kill resolves attached session id and rejects positional args', async () => {
    await writeActiveSessionId('active-session');

    const resolvedResult = await execa('node', ['dist/index.js', 'kill'], {
      env: {
        ...process.env,
        AGENTTY_HOME: tempHome,
      },
      reject: false,
    });

    expect(resolvedResult.exitCode).toBe(1);
    expect(resolvedResult.stderr).toContain('session is not running: active-session');

    const positionalResult = await execa('node', ['dist/index.js', 'kill', 'unexpected'], {
      env: {
        ...process.env,
        AGENTTY_HOME: tempHome,
      },
      reject: false,
    });

    expect(positionalResult.exitCode).toBe(1);
    expect(positionalResult.stderr).toContain('kill does not accept positional arguments');
  });
});
