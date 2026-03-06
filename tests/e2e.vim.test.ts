import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface StatusJson {
  sessions?: Array<{
    id?: string;
    pid?: number;
  }>;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('e2e: vim (cli process invocations)', () => {
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

  async function runCommand(args: string[]): Promise<CommandResult> {
    const result = await execa('node', ['dist/index.js', ...args], {
      env: {
        ...process.env,
        AGENTTY_HOME: tempHome,
      },
      reject: false,
      timeout: 10_000,
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  }

  async function getSessionPid(sessionId: string): Promise<number | undefined> {
    const statusResult = await runCommand(['status', '--json']);

    if (statusResult.exitCode !== 0 || !statusResult.stdout) {
      return undefined;
    }

    const status = JSON.parse(statusResult.stdout) as StatusJson;
    const session = status.sessions?.find((candidate) => candidate.id === sessionId);

    return typeof session?.pid === 'number' ? session.pid : undefined;
  }

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

      await sleep(intervalMs);
    }

    return false;
  }

  it('vim interaction works across separate CLI invocations', async () => {
    let sessionId: string | undefined;
    let pid: number | undefined;

    try {
      const startResult = await runCommand([
        'start',
        'sh',
        '-lc',
        'command -v vim >/dev/null 2>&1 && exec vim || exec vi',
      ]);

      expect(startResult.exitCode).toBe(0);
      sessionId = startResult.stdout;
      expect(sessionId).toBeTruthy();

      const attachResult = await runCommand(['attach', sessionId]);
      expect(attachResult.exitCode).toBe(0);
      expect(attachResult.stdout).toBe(sessionId);

      expect((await runCommand(['key', '--session', sessionId, 'i'])).exitCode).toBe(0);
      expect((await runCommand(['text', '--session', sessionId, 'hello'])).exitCode).toBe(0);
      expect((await runCommand(['key', '--session', sessionId, 'Esc'])).exitCode).toBe(0);
      expect((await runCommand(['text', '--session', sessionId, ':q!'])).exitCode).toBe(0);
      expect((await runCommand(['key', '--session', sessionId, 'Enter'])).exitCode).toBe(0);

      pid = await getSessionPid(sessionId);

      if (pid !== undefined) {
        const exited = await waitForProcessExit(pid, 6_000);

        if (!exited) {
          const killResult = await runCommand(['kill', '--session', sessionId]);
          expect(killResult.exitCode).toBe(0);
          expect(await waitForProcessExit(pid, 5_000)).toBe(true);
        }
      }
    } finally {
      if (sessionId) {
        await runCommand(['kill', '--session', sessionId]);
      }

      if (pid !== undefined) {
        const exited = await waitForProcessExit(pid, 500);

        if (!exited) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // already exited
          }
        }
      }
    }
  });
});
