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

describe('e2e: python repl (cli process invocations)', () => {
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

  async function waitForSnapshotContains(sessionId: string, needle: RegExp): Promise<string> {
    const timeoutMs = 8_000;
    const intervalMs = 50;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const result = await runCommand(['get', '--session', sessionId, '--lines', '200']);

      if (result.exitCode === 0 && needle.test(result.stdout)) {
        return result.stdout;
      }

      await sleep(intervalMs);
    }

    throw new Error(`Timed out waiting for snapshot to match ${needle}`);
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

  it('python repl interaction works across separate CLI invocations', async () => {
    let sessionId: string | undefined;
    let pid: number | undefined;

    try {
      const startedAt = Date.now();
      const startResult = await runCommand(['start', 'python3', '-i']);
      const elapsedMs = Date.now() - startedAt;

      expect(startResult.exitCode).toBe(0);
      expect(elapsedMs).toBeLessThan(2_000);
      sessionId = startResult.stdout;
      expect(sessionId).toBeTruthy();

      const attachResult = await runCommand(['attach', sessionId]);
      expect(attachResult.exitCode).toBe(0);
      expect(attachResult.stdout).toBe(sessionId);

      const textResult = await runCommand(['text', '--session', sessionId, 'print(2+2)']);
      expect(textResult.exitCode).toBe(0);

      const enterResult = await runCommand(['key', '--session', sessionId, 'Enter']);
      expect(enterResult.exitCode).toBe(0);

      const snapshot = await waitForSnapshotContains(sessionId, /(^|\n)4(\n|$)/);
      expect(snapshot).toContain('4');

      pid = await getSessionPid(sessionId);

      const ctrlDResult = await runCommand(['key', '--session', sessionId, 'Ctrl+D']);
      expect(ctrlDResult.exitCode).toBe(0);

      if (pid !== undefined) {
        const exited = await waitForProcessExit(pid, 4_000);

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
