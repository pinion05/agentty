import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readSessions, upsertSession } from '../src/state';

describe('state concurrency', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    originalEnv = process.env.AGENTTY_HOME;
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'agentty-state-concurrent-'));
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

  it('preserves every session record across concurrent upserts', async () => {
    const sessionCount = 24;

    await Promise.all(
      Array.from({ length: sessionCount }, (_, index) =>
        upsertSession({
          id: `session-${index}`,
          status: 'running',
          socketPath: `/tmp/session-${index}.sock`,
        }),
      ),
    );

    const sessions = await readSessions();
    const sessionIds = sessions
      .map((session) => session.id)
      .filter((id): id is string => typeof id === 'string')
      .sort();

    expect(sessionIds).toEqual(
      Array.from({ length: sessionCount }, (_, index) => `session-${index}`).sort(),
    );
  });
});
