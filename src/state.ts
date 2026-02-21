import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import type { ActiveSessionId, SessionRecord, SessionRecordList } from './types';

const SESSIONS_FILE = 'sessions.json';
const ACTIVE_SESSION_FILE = 'active-session-id';
const SOCKETS_DIR = 'sockets';

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

export function getSocketsRoot(): string {
  if (process.platform === 'darwin') {
    const uid = typeof process.getuid === 'function' ? String(process.getuid()) : 'unknown';
    const stateHash = createHash('sha256').update(getStateRoot()).digest('hex').slice(0, 8);

    return path.join('/tmp', `agentty-${uid}-${stateHash}`, SOCKETS_DIR);
  }

  return path.join(getStateRoot(), SOCKETS_DIR);
}

export function getSessionSocketPath(sessionId: string): string {
  return path.join(getSocketsRoot(), `${sessionId}.sock`);
}

async function ensureStateRoot(): Promise<void> {
  await mkdir(getStateRoot(), { recursive: true });
}

export async function ensureSocketsRoot(): Promise<void> {
  await mkdir(getSocketsRoot(), { recursive: true });
}

function validateSessions(value: unknown): SessionRecordList {
  if (!Array.isArray(value)) {
    throw new Error('Invalid sessions.json: expected an array');
  }

  for (const session of value) {
    if (
      typeof session !== 'object' ||
      session === null ||
      typeof (session as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Invalid sessions.json: each session must be an object with string id');
    }
  }

  return value as SessionRecordList;
}

export async function readSessions(): Promise<SessionRecordList> {
  try {
    const raw = await readFile(getSessionsPath(), 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid sessions.json: malformed JSON');
      }

      throw error;
    }

    return validateSessions(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function writeSessions(sessions: SessionRecordList): Promise<void> {
  await ensureStateRoot();

  const sessionsPath = getSessionsPath();
  const tempPath = `${sessionsPath}.${process.pid}.${Date.now()}.tmp`;
  const serialized = JSON.stringify(sessions, null, 2);

  await writeFile(tempPath, serialized, 'utf8');
  await rename(tempPath, sessionsPath);
}

export async function readSessionById(sessionId: string): Promise<SessionRecord | undefined> {
  const sessions = await readSessions();
  return sessions.find((session) => session.id === sessionId);
}

export async function upsertSession(sessionRecord: SessionRecord): Promise<void> {
  const sessions = await readSessions();
  const index = sessions.findIndex((session) => session.id === sessionRecord.id);

  if (index === -1) {
    sessions.push(sessionRecord);
  } else {
    sessions[index] = {
      ...sessions[index],
      ...sessionRecord,
    };
  }

  await writeSessions(sessions);
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
