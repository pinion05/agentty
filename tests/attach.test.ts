import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readActiveSessionId, upsertSession, writeActiveSessionId } from '../src/state';
import { attachSession, resolveTargetSessionId } from '../src/resolveSession';

describe('attach and session resolution', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-attach-test-'));
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

  it('attachSession sets active session pointer', async () => {
    await upsertSession({
      id: 'session-1',
      status: 'running',
      socketPath: '/tmp/session-1.sock',
    });

    await attachSession('session-1');

    expect(await readActiveSessionId()).toBe('session-1');
  });

  it('resolveTargetSessionId returns explicit id when provided', async () => {
    await writeActiveSessionId('active-session');

    await expect(resolveTargetSessionId('explicit-session')).resolves.toBe('explicit-session');
  });

  it('resolveTargetSessionId falls back to active session id', async () => {
    await writeActiveSessionId('active-session');

    await expect(resolveTargetSessionId()).resolves.toBe('active-session');
  });

  it('resolveTargetSessionId throws when no active session exists', async () => {
    await expect(resolveTargetSessionId()).rejects.toThrow('no active session');
  });

  it('agentty attach writes pointer and prints attached id', async () => {
    await upsertSession({
      id: 'session-cli',
      status: 'running',
      socketPath: '/tmp/session-cli.sock',
    });

    const { stdout } = await execa('node', ['dist/index.js', 'attach', 'session-cli'], {
      env: {
        ...process.env,
        AGENTTY_HOME: tempHome,
      },
    });

    expect(stdout).toBe('session-cli');
    expect(await readActiveSessionId()).toBe('session-cli');
  });

  it('attachSession rejects nonexistent sessions', async () => {
    await expect(attachSession('missing-session')).rejects.toThrow(
      'session is not running: missing-session',
    );
    await expect(readActiveSessionId()).resolves.toBeNull();
  });

  it('agentty attach rejects exited sessions', async () => {
    await upsertSession({
      id: 'exited-session',
      status: 'exited',
      socketPath: '/tmp/exited-session.sock',
    });

    const result = await execa('node', ['dist/index.js', 'attach', 'exited-session'], {
      env: {
        ...process.env,
        AGENTTY_HOME: tempHome,
      },
      reject: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('session is not running: exited-session');
    await expect(readActiveSessionId()).resolves.toBeNull();
  });
});
