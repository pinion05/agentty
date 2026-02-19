import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

interface CliIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

type RunCli = (argv?: string[], io?: CliIo) => Promise<void>;

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

let runCli: RunCli;

async function loadRunCli(): Promise<RunCli> {
  const cliModuleUrl = pathToFileURL(path.join(process.cwd(), 'dist/index.js')).href;
  const cliModule = (await import(cliModuleUrl)) as { runCli?: RunCli };

  if (typeof cliModule.runCli !== 'function') {
    throw new Error('runCli export is missing from dist/index.js');
  }

  return cliModule.runCli;
}

async function runCommand(args: string[]): Promise<CommandResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    await runCli(args, {
      stdout: (line) => {
        stdout.push(line);
      },
      stderr: (line) => {
        stderr.push(line);
      },
    });

    return {
      exitCode: 0,
      stdout: stdout.join('\n').trim(),
      stderr: stderr.join('\n').trim(),
    };
  } catch (error) {
    stderr.push(error instanceof Error ? error.message : String(error));

    return {
      exitCode: 1,
      stdout: stdout.join('\n').trim(),
      stderr: stderr.join('\n').trim(),
    };
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

describe('e2e: vim (cli surface)', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeAll(async () => {
    runCli = await loadRunCli();
  });

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

  it('vim interaction works through start/attach/text/key/get', async () => {
    let sessionId: string | undefined;
    let pid: number | undefined;

    try {
      const startResult = await runCommand([
        'start',
        'command',
        '-v',
        'vim',
        '>/dev/null',
        '2>&1',
        '&&',
        'exec',
        'vim',
        '||',
        'exec',
        'vi',
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
        const exited = await waitForProcessExit(pid, 5_000);

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
