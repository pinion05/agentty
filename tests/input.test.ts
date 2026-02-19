import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveKeyInput } from '../src/keymap';
import { sendKey, sendText, startSession } from '../src/sessionRuntime';

async function waitForFileContains(filePath: string, needle: string): Promise<string> {
  const timeoutMs = 2_000;
  const intervalMs = 50;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const contents = await readFile(filePath, 'utf8');

      if (contents.includes(needle)) {
        return contents;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${needle} in ${filePath}`);
}

describe('input delivery', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-input-test-'));
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

  it('text writes plain string and key Enter sends CR', async () => {
    let pid: number | undefined;

    try {
      const outputPath = path.join(tempHome, 'stdin-capture.txt');
      const session = await startSession({
        command: `cat > ${JSON.stringify(outputPath)}`,
        cwd: process.cwd(),
      });

      pid = session.pid;

      await sendText(session.id, 'print(2+2)');
      await sendKey(session.id, 'Enter');

      const contents = await waitForFileContains(outputPath, 'print(2+2)');
      expect(contents).toMatch(/print\(2\+2\)\r?\n/);
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

  it('supports required key mappings', () => {
    expect(resolveKeyInput('Enter')).toBe('\r');
    expect(resolveKeyInput('Tab')).toBe('\t');
    expect(resolveKeyInput('Up')).toBe('\u001b[A');
    expect(resolveKeyInput('Down')).toBe('\u001b[B');
    expect(resolveKeyInput('Left')).toBe('\u001b[D');
    expect(resolveKeyInput('Right')).toBe('\u001b[C');
    expect(resolveKeyInput('Esc')).toBe('\u001b');
    expect(resolveKeyInput('Ctrl+C')).toBe('\u0003');
    expect(resolveKeyInput('Ctrl+D')).toBe('\u0004');
    expect(() => resolveKeyInput('F1')).toThrow('Unsupported key: F1');
  });
});
