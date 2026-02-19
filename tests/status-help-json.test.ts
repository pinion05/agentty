import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeSessions } from '../src/state';

describe('status/help json modes', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-status-help-test-'));
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

  it('status prints human-readable text by default', async () => {
    await writeSessions([{ id: 'session-text', status: 'running' }]);

    const { stdout } = await execa('node', ['dist/index.js', 'status'], {
      env: {
        ...process.env,
        AGENTTY_HOME: tempHome,
      },
    });

    expect(stdout).toContain('runtime');
    expect(stdout).toContain('sessions: 1');
    expect(stdout).toContain('session-text');
  });

  it('status --json returns runtime and sessions', async () => {
    const sessions = [
      { id: 'session-json-1', status: 'running' },
      { id: 'session-json-2', status: 'exited' },
    ];

    await writeSessions(sessions);

    const { stdout } = await execa('node', ['dist/index.js', 'status', '--json'], {
      env: {
        ...process.env,
        AGENTTY_HOME: tempHome,
      },
    });

    const parsed = JSON.parse(stdout) as {
      runtime?: unknown;
      sessions?: unknown;
    };

    expect(parsed.runtime).toBeTypeOf('object');
    expect(parsed.sessions).toEqual(sessions);
  });

  it('help --json returns command contract schema', async () => {
    const { stdout } = await execa('node', ['dist/index.js', 'help', '--json']);
    const parsed = JSON.parse(stdout) as {
      commands?: Record<string, { options?: Array<{ name: string }>; supportedKeys?: string[] }>;
    };

    expect(Object.keys(parsed.commands ?? {})).toEqual(
      expect.arrayContaining(['help', 'status', 'start', 'attach', 'get', 'text', 'key', 'kill']),
    );

    expect(parsed.commands?.key?.supportedKeys).toEqual(expect.arrayContaining(['Enter', 'Ctrl+C', 'Ctrl+D']));
    expect(parsed.commands?.key?.options).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '--session' })]),
    );
  });
});
