import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readSessions } from '../src/state';
import { startSession } from '../src/sessionRuntime';

describe('sessionRuntime.startSession', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-runtime-test-'));
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

  it('start creates running session metadata in sessions.json', async () => {
    let pid: number | undefined;

    try {
      const session = await startSession({
        command: 'sleep 30',
        cwd: process.cwd(),
        name: 'test-session',
      });

      pid = session.pid;

      expect(session.id).toEqual(expect.any(String));
      expect(session.pid).toEqual(expect.any(Number));
      expect(session.command).toBe('sleep 30');
      expect(session.cwd).toBe(process.cwd());
      expect(session.status).toBe('running');
      expect(session.exitCode).toBeNull();
      expect(session.startedAt).toEqual(expect.any(String));
      expect(session.lastActiveAt).toEqual(expect.any(String));

      const sessions = await readSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: session.id,
        pid: session.pid,
        command: 'sleep 30',
        cwd: process.cwd(),
        status: 'running',
        exitCode: null,
      });
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
});
