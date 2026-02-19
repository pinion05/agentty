import { randomUUID } from 'node:crypto';

import { spawn, type IPty } from 'node-pty';

import { resolveKeyInput } from './keymap';
import { readSessions, writeSessions } from './state';

export interface StartSessionInput {
  command: string;
  cwd: string;
  name?: string;
}

export interface SessionMetadata {
  id: string;
  pid: number;
  command: string;
  cwd: string;
  startedAt: string;
  lastActiveAt: string;
  status: 'running' | 'exited';
  exitCode: number | null;
  name?: string;
}

const MAX_SNAPSHOT_CHARS = 200_000;

const runtimeSessions = new Map<string, IPty>();
const runtimeOutputBySession = new Map<string, string>();

function getRuntimeSession(sessionId: string): IPty {
  const session = runtimeSessions.get(sessionId);

  if (!session) {
    throw new Error(`session is not running: ${sessionId}`);
  }

  return session;
}

export async function startSession({ command, cwd, name }: StartSessionInput): Promise<SessionMetadata> {
  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    throw new Error('command is required');
  }

  const shell = process.env.SHELL || '/bin/bash';
  const ptyProcess = spawn(shell, ['-lc', trimmedCommand], {
    cwd,
    env: process.env,
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
  });

  const now = new Date().toISOString();
  const session: SessionMetadata = {
    id: randomUUID(),
    pid: ptyProcess.pid,
    command: trimmedCommand,
    cwd,
    startedAt: now,
    lastActiveAt: now,
    status: 'running',
    exitCode: null,
    ...(name ? { name } : {}),
  };

  runtimeSessions.set(session.id, ptyProcess);
  runtimeOutputBySession.set(session.id, '');

  ptyProcess.onData?.((chunk) => {
    const normalizedChunk = chunk.replace(/\r/g, '');
    const current = runtimeOutputBySession.get(session.id) ?? '';
    const next = `${current}${normalizedChunk}`;

    if (next.length > MAX_SNAPSHOT_CHARS) {
      runtimeOutputBySession.set(session.id, next.slice(-MAX_SNAPSHOT_CHARS));
      return;
    }

    runtimeOutputBySession.set(session.id, next);
  });

  ptyProcess.onExit(() => {
    runtimeSessions.delete(session.id);
    runtimeOutputBySession.delete(session.id);
  });

  const sessions = await readSessions();

  try {
    await writeSessions([...sessions, session]);
  } catch (error) {
    const originalError = error;

    try {
      ptyProcess.kill();
    } catch {
      // ignore cleanup errors to preserve the persistence failure
    } finally {
      runtimeSessions.delete(session.id);
      runtimeOutputBySession.delete(session.id);
    }

    throw originalError;
  }

  return session;
}

export async function sendText(sessionId: string, payload: string): Promise<void> {
  const session = getRuntimeSession(sessionId);
  session.write(payload);
}

export async function sendKey(sessionId: string, keyName: string): Promise<void> {
  const session = getRuntimeSession(sessionId);
  session.write(resolveKeyInput(keyName));
}

export async function getSnapshot(sessionId: string, lines = 20): Promise<string> {
  getRuntimeSession(sessionId);

  const requestedLines = Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 20;
  const output = runtimeOutputBySession.get(sessionId) ?? '';
  const parts = output.split('\n');

  if (parts[parts.length - 1] === '') {
    parts.pop();
  }

  return parts.slice(-requestedLines).join('\n');
}
