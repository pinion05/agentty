import { access, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { requestIpc } from './ipc';
import {
  getSessionSocketPath,
  getStateRoot,
  readActiveSessionId,
  readSessionById,
  upsertSession,
  writeActiveSessionId,
} from './state';

export interface StartSessionInput {
  command: string;
  args?: string[];
  cwd: string;
  name?: string;
  displayCommand?: string;
}

export interface SessionMetadata {
  id: string;
  pid: number;
  workerPid: number;
  command: string;
  cwd: string;
  startedAt: string;
  lastActiveAt: string;
  status: 'running' | 'exited';
  exitCode: number | null;
  socketPath: string;
  name?: string;
}

const WORKER_ENTRY_PATH = path.resolve(__dirname, '../dist/worker.js');
const LOGS_DIR = 'logs';
const KILL_WAIT_TIMEOUT_MS = 3_000;
const KILL_WAIT_INTERVAL_MS = 50;
const START_READY_TIMEOUT_MS = 10_000;
const START_READY_POLL_INTERVAL_MS = 50;

function isUnavailableIpcError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;

  if (code === 'ENOENT' || code === 'ECONNREFUSED' || code === 'EPIPE' || code === 'ENOTCONN') {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);

  return message === 'IPC request timed out' || message === 'session is not running';
}

async function resolveRunningSession(sessionId: string): Promise<{ socketPath: string }> {
  const session = await readSessionById(sessionId);

  if (!session || session.status === 'exited' || typeof session.socketPath !== 'string') {
    throw new Error(`session is not running: ${sessionId}`);
  }

  return {
    socketPath: session.socketPath,
  };
}

async function markSessionExited(sessionId: string, exitCode: number | null): Promise<void> {
  const session = await readSessionById(sessionId);

  if (!session) {
    return;
  }

  await upsertSession({
    ...session,
    status: 'exited',
    exitCode,
    lastActiveAt: new Date().toISOString(),
  });

  const activeSessionId = await readActiveSessionId();

  if (activeSessionId === sessionId) {
    await writeActiveSessionId(null);
  }
}

async function waitForExited(sessionId: string): Promise<boolean> {
  const deadline = Date.now() + KILL_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const session = await readSessionById(sessionId);

    if (!session || session.status === 'exited') {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, KILL_WAIT_INTERVAL_MS));
  }

  return false;
}

function getWorkerLogPath(sessionId: string): string {
  return path.join(getStateRoot(), LOGS_DIR, `${sessionId}.log`);
}

async function waitForSocketReady(socketPath: string, didWorkerExit: () => boolean): Promise<boolean> {
  const deadline = Date.now() + START_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      await access(socketPath);
      return true;
    } catch {
      // continue polling
    }

    if (didWorkerExit()) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, START_READY_POLL_INTERVAL_MS));
  }

  try {
    await access(socketPath);
    return true;
  } catch {
    return false;
  }
}

async function waitForSessionReady(
  sessionId: string,
  workerPid: number,
  didWorkerExit: () => boolean,
): Promise<SessionMetadata | null> {
  const deadline = Date.now() + START_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const session = await readSessionById(sessionId);

    if (
      session &&
      session.status === 'running' &&
      typeof session.pid === 'number' &&
      typeof session.workerPid === 'number' &&
      session.pid !== workerPid
    ) {
      return session as SessionMetadata;
    }

    if (didWorkerExit()) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, START_READY_POLL_INTERVAL_MS));
  }

  return null;
}

export async function startSession({ command, args, cwd, name, displayCommand }: StartSessionInput): Promise<SessionMetadata> {
  const trimmedCommand = command.trim();

  if (!trimmedCommand) {
    throw new Error('command is required');
  }

  try {
    await access(WORKER_ENTRY_PATH);
  } catch {
    throw new Error(`worker entry is missing: ${WORKER_ENTRY_PATH}`);
  }

  const now = new Date().toISOString();
  const sessionId = randomUUID();
  const socketPath = getSessionSocketPath(sessionId);

  const workerSpec = {
    id: sessionId,
    command: trimmedCommand,
    ...(args ? { args } : {}),
    cwd,
    socketPath,
    startedAt: now,
    ...(displayCommand ? { displayCommand } : {}),
    ...(name ? { name } : {}),
  };

  const logsRoot = path.join(getStateRoot(), LOGS_DIR);
  await mkdir(logsRoot, { recursive: true });

  const logFilePath = getWorkerLogPath(sessionId);
  const logFile = await open(logFilePath, 'a');

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(process.execPath, [WORKER_ENTRY_PATH], {
      detached: true,
      stdio: ['ignore', logFile.fd, logFile.fd],
      env: {
        ...process.env,
        AGENTTY_WORKER_SPEC: JSON.stringify(workerSpec),
      },
    });
  } finally {
    await logFile.close();
  }

  if (!child.pid) {
    throw new Error('failed to spawn session worker');
  }

  let workerExited = false;
  let workerExitCode: number | null = null;

  child.once('exit', (code) => {
    workerExited = true;
    workerExitCode = code ?? null;
  });

  child.once('error', () => {
    workerExited = true;
  });

  const session: SessionMetadata = {
    id: sessionId,
    pid: child.pid,
    workerPid: child.pid,
    command: displayCommand ?? trimmedCommand,
    cwd,
    startedAt: now,
    lastActiveAt: now,
    status: 'running',
    exitCode: null,
    socketPath,
    ...(name ? { name } : {}),
  };

  try {
    await upsertSession(session);
  } catch (error) {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      // ignore cleanup errors
    }

    throw error;
  }

  const socketReady = await waitForSocketReady(socketPath, () => workerExited);

  if (!socketReady) {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      // ignore cleanup errors
    }

    await markSessionExited(sessionId, workerExitCode);

    throw new Error(
      `session worker failed to start (socket was not created within ${START_READY_TIMEOUT_MS}ms): ${socketPath}. Check worker log: ${logFilePath}`,
    );
  }

  const readySession = await waitForSessionReady(sessionId, child.pid, () => workerExited);

  if (!readySession) {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      // ignore cleanup errors
    }

    await markSessionExited(sessionId, workerExitCode);

    throw new Error(
      `session worker failed to become ready within ${START_READY_TIMEOUT_MS}ms: ${socketPath}. Check worker log: ${logFilePath}`,
    );
  }

  child.unref();

  return readySession;
}

export async function sendText(sessionId: string, payload: string): Promise<void> {
  const session = await resolveRunningSession(sessionId);

  try {
    await requestIpc(session.socketPath, {
      method: 'text',
      payload,
    });
  } catch (error) {
    if (isUnavailableIpcError(error)) {
      await markSessionExited(sessionId, null);
      throw new Error(`session is not running: ${sessionId}`);
    }

    throw error;
  }
}

export async function sendKey(sessionId: string, keyName: string): Promise<void> {
  const session = await resolveRunningSession(sessionId);

  try {
    await requestIpc(session.socketPath, {
      method: 'key',
      keyName,
    });
  } catch (error) {
    if (isUnavailableIpcError(error)) {
      await markSessionExited(sessionId, null);
      throw new Error(`session is not running: ${sessionId}`);
    }

    throw error;
  }
}

export async function getSnapshot(sessionId: string, lines = 20): Promise<string> {
  const session = await resolveRunningSession(sessionId);

  try {
    const response = await requestIpc(session.socketPath, {
      method: 'get',
      lines,
    });

    return typeof response === 'string' ? response : '';
  } catch (error) {
    if (isUnavailableIpcError(error)) {
      await markSessionExited(sessionId, null);
      throw new Error(`session is not running: ${sessionId}`);
    }

    throw error;
  }
}

export async function killSession(sessionId: string): Promise<void> {
  const session = await resolveRunningSession(sessionId);

  try {
    await requestIpc(session.socketPath, {
      method: 'kill',
    });
    const exited = await waitForExited(sessionId);

    if (!exited) {
      throw new Error(`session did not exit within ${KILL_WAIT_TIMEOUT_MS}ms: ${sessionId}`);
    }
  } catch (error) {
    if (isUnavailableIpcError(error)) {
      await markSessionExited(sessionId, null);
      throw new Error(`session is not running: ${sessionId}`);
    }

    throw error;
  }

  const activeSessionId = await readActiveSessionId();

  if (activeSessionId === sessionId) {
    await writeActiveSessionId(null);
  }
}
