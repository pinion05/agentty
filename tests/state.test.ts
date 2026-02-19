import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
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

  it('returns empty sessions and null active session when files are missing', async () => {
    expect(await readSessions()).toEqual([]);
    expect(await readActiveSessionId()).toBeNull();
  });

  it('reads and writes active session id', async () => {
    await writeActiveSessionId('session-123');

    expect(await readActiveSessionId()).toBe('session-123');
  });
});
