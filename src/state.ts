import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ActiveSessionId, SessionRecordList } from './types';

const SESSIONS_FILE = 'sessions.json';
const ACTIVE_SESSION_FILE = 'active-session-id';

export function getStateRoot(): string {
  const overridden = process.env.AGENTTY_HOME?.trim();

  if (overridden) {
    return path.resolve(overridden);
  }

  return path.join(os.homedir(), '.agentty');
}

function getSessionsPath(): string {
  return path.join(getStateRoot(), SESSIONS_FILE);
}

function getActiveSessionPath(): string {
  return path.join(getStateRoot(), ACTIVE_SESSION_FILE);
}

async function ensureStateRoot(): Promise<void> {
  await mkdir(getStateRoot(), { recursive: true });
}

export async function readSessions(): Promise<SessionRecordList> {
  try {
    const raw = await readFile(getSessionsPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('sessions.json must contain a JSON array');
    }

    return parsed as SessionRecordList;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function writeSessions(sessions: SessionRecordList): Promise<void> {
  await ensureStateRoot();
  await writeFile(getSessionsPath(), JSON.stringify(sessions, null, 2), 'utf8');
}

export async function readActiveSessionId(): Promise<ActiveSessionId> {
  try {
    const raw = await readFile(getActiveSessionPath(), 'utf8');
    const sessionId = raw.trim();

    return sessionId.length > 0 ? sessionId : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function writeActiveSessionId(sessionId: ActiveSessionId): Promise<void> {
  await ensureStateRoot();

  if (!sessionId) {
    await rm(getActiveSessionPath(), { force: true });
    return;
  }

  await writeFile(getActiveSessionPath(), sessionId, 'utf8');
}
