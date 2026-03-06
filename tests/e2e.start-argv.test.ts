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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('e2e: start argv preservation', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-e2e-start-argv-'));
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

  async function waitForSnapshotContains(sessionId: string, needle: string): Promise<string> {
    const timeoutMs = 8_000;
    const intervalMs = 50;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const result = await runCommand(['get', '--session', sessionId, '--lines', '200']);

      if (result.exitCode === 0 && result.stdout.includes(needle)) {
        return result.stdout;
      }

      await sleep(intervalMs);
    }

    throw new Error(`Timed out waiting for snapshot to contain ${needle}`);
  }

  it('preserves quoted and empty argv entries passed to start', async () => {
    const printedArgs = JSON.stringify(['hello world', '', 'literal"quote']);
    const script = [
      'console.log(JSON.stringify(process.argv.slice(1)));',
      'setTimeout(() => {}, 30000);',
    ].join(' ');

    let sessionId: string | undefined;

    try {
      const startResult = await runCommand([
        'start',
        '--name',
        'argv-test',
        '--',
        'node',
        '-e',
        script,
        'hello world',
        '',
        'literal"quote',
      ]);

      expect(startResult.exitCode).toBe(0);
      sessionId = startResult.stdout;
      expect(sessionId).toBeTruthy();

      const snapshot = await waitForSnapshotContains(sessionId, printedArgs);
      expect(snapshot).toContain(printedArgs);
    } finally {
      if (sessionId) {
        await runCommand(['kill', '--session', sessionId]);
      }
    }
  });
});
