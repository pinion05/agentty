import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getSessionSocketPath,
  getStateRoot,
  readActiveSessionId,
  readSessions,
  writeActiveSessionId,
  writeSessions,
} from '../src/state';

describe('state', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-state-test-'));
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

  it('uses ~/.agentty by default when AGENTTY_HOME is not set', () => {
    delete process.env.AGENTTY_HOME;

    expect(getStateRoot()).toBe(path.join(os.homedir(), '.agentty'));
  });

  it('reads and writes sessions from sessions.json', async () => {
    const sessions = [{ id: 's1' }, { id: 's2' }];

    await writeSessions(sessions);

    expect(await readSessions()).toEqual(sessions);

    const fileText = await readFile(path.join(tempHome, 'sessions.json'), 'utf8');
    expect(JSON.parse(fileText)).toEqual(sessions);
  });

  it('throws a clear error when sessions.json is malformed JSON', async () => {
    await writeFile(path.join(tempHome, 'sessions.json'), '{ not valid json', 'utf8');

    await expect(readSessions()).rejects.toThrow('Invalid sessions.json: malformed JSON');
  });

  it('throws a clear error when sessions.json is not an array', async () => {
    await writeFile(path.join(tempHome, 'sessions.json'), JSON.stringify({ id: 's1' }), 'utf8');

    await expect(readSessions()).rejects.toThrow('Invalid sessions.json: expected an array');
  });

  it('throws a clear error when sessions.json has invalid session shapes', async () => {
    const invalidCases = [
      [null],
      ['session'],
      [{}],
      [{ id: 123 }],
    ];

    for (const content of invalidCases) {
      await writeFile(path.join(tempHome, 'sessions.json'), JSON.stringify(content), 'utf8');

      await expect(readSessions()).rejects.toThrow('Invalid sessions.json: each session must be an object with string id');
    }
  });

  it('returns empty sessions and null active session when files are missing', async () => {
    expect(await readSessions()).toEqual([]);
    expect(await readActiveSessionId()).toBeNull();
  });

  it('reads and writes active session id', async () => {
    await writeActiveSessionId('session-123');

    expect(await readActiveSessionId()).toBe('session-123');
  });

  it('keeps macOS socket path within unix socket path length limit for long AGENTTY_HOME', () => {
    if (process.platform !== 'darwin') {
      return;
    }

    process.env.AGENTTY_HOME = `/tmp/${'a'.repeat(80)}`;
    const socketPath = getSessionSocketPath('12345678-1234-1234-1234-123456789abc');

    expect(socketPath.length).toBeLessThanOrEqual(104);
  });
});
