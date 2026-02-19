import { randomUUID } from 'node:crypto';

import { spawn, type IPty } from 'node-pty';

import { resolveKeyInput } from './keymap';
import {
  readActiveSessionId,
  readSessions,
  writeActiveSessionId,
  writeSessions,
} from './state';

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
const TERM_TIMEOUT_MS = 500;
const KILL_TIMEOUT_MS = 2_000;

const runtimeSessions = new Map<string, IPty>();
const runtimeOutputBySession = new Map<string, string>();
const runtimeExitBySession = new Map<string, Promise<number | null>>();
const runtimeExitResolvers = new Map<string, (exitCode: number | null) => void>();

function getRuntimeSession(sessionId: string): IPty {
  const session = runtimeSessions.get(sessionId);

  if (!session) {
    throw new Error(`session is not running: ${sessionId}`);
  }

  return session;
}

function cleanupRuntimeSession(sessionId: string): void {
  runtimeSessions.delete(sessionId);
  runtimeOutputBySession.delete(sessionId);
  runtimeExitBySession.delete(sessionId);
  runtimeExitResolvers.delete(sessionId);
}

async function updateKilledSessionMetadata(sessionId: string, exitCode: number | null): Promise<void> {
  const sessions = await readSessions();
  const now = new Date().toISOString();

  const updatedSessions = sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    return {
      ...session,
      status: 'exited',
      exitCode,
      lastActiveAt: now,
    };
  });

  await writeSessions(updatedSessions);

  const activeSessionId = await readActiveSessionId();

  if (activeSessionId === sessionId) {
    await writeActiveSessionId(null);
  }
}

async function waitForExit(
  exitPromise: Promise<number | null>,
  timeoutMs: number,
): Promise<{ timedOut: boolean; exitCode: number | null }> {
  const timeoutToken = Symbol('timeout');
  const result = await Promise.race<number | null | symbol>([
    exitPromise,
    new Promise<symbol>((resolve) => {
      setTimeout(() => resolve(timeoutToken), timeoutMs);
    }),
  ]);

  if (result === timeoutToken) {
    return {
      timedOut: true,
      exitCode: null,
    };
  }

  return {
    timedOut: false,
    exitCode: result,
  };
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

  const exitPromise = new Promise<number | null>((resolve) => {
    runtimeExitResolvers.set(session.id, resolve);
  });
  runtimeExitBySession.set(session.id, exitPromise);

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

  ptyProcess.onExit(({ exitCode }) => {
    const resolveExit = runtimeExitResolvers.get(session.id);

    if (resolveExit) {
      resolveExit(exitCode ?? null);
    }

    cleanupRuntimeSession(session.id);
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
      cleanupRuntimeSession(session.id);
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

export async function killSession(sessionId: string): Promise<void> {
  const session = getRuntimeSession(sessionId);
  const exitPromise = runtimeExitBySession.get(sessionId);
  let exitCode: number | null = null;

  try {
    session.kill('SIGTERM');
  } catch {
    // continue to SIGKILL fallback
  }

  if (exitPromise) {
    const termResult = await waitForExit(exitPromise, TERM_TIMEOUT_MS);

    if (termResult.timedOut) {
      try {
        session.kill('SIGKILL');
      } catch {
        // ignore signal errors and continue metadata cleanup
      }

      const killResult = await waitForExit(exitPromise, KILL_TIMEOUT_MS);
      exitCode = killResult.exitCode;

      if (killResult.timedOut) {
        cleanupRuntimeSession(sessionId);
      }
    } else {
      exitCode = termResult.exitCode;
    }
  } else {
    cleanupRuntimeSession(sessionId);
  }

  await updateKilledSessionMetadata(sessionId, exitCode);
}
