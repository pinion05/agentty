import net from 'node:net';
import path from 'node:path';
import { chmod, rm, stat } from 'node:fs/promises';

import { spawn, type IPty } from 'node-pty';

import type { IpcRequest } from './ipc';
import { resolveKeyInput } from './keymap';
import { ensureSocketsRoot, readActiveSessionId, readSessionById, upsertSession, writeActiveSessionId } from './state';
import type { SessionRecord } from './types';

interface WorkerSpec {
  id: string;
  command: string;
  args?: string[];
  cwd: string;
  name?: string;
  socketPath: string;
  startedAt: string;
  displayCommand?: string;
}

interface IpcResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

const MAX_SNAPSHOT_CHARS = 200_000;
const TERM_TIMEOUT_MS = 500;

let ptyProcess: IPty | undefined;
let outputBuffer = '';
let exitCode: number | null = null;
let exited = false;
let killRequested = false;
let server: net.Server | undefined;

function parseWorkerSpec(): WorkerSpec {
  const raw = process.env.AGENTTY_WORKER_SPEC;

  if (!raw) {
    throw new Error('AGENTTY_WORKER_SPEC is required');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AGENTTY_WORKER_SPEC must be valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AGENTTY_WORKER_SPEC must be an object');
  }

  const spec = parsed as Partial<WorkerSpec>;

  if (!spec.id || !spec.command || !spec.cwd || !spec.socketPath || !spec.startedAt) {
    throw new Error('AGENTTY_WORKER_SPEC is missing required fields');
  }

  return {
    id: spec.id,
    command: spec.command,
    ...(Array.isArray(spec.args) ? { args: spec.args } : {}),
    cwd: spec.cwd,
    socketPath: spec.socketPath,
    startedAt: spec.startedAt,
    ...(spec.displayCommand ? { displayCommand: spec.displayCommand } : {}),
    ...(spec.name ? { name: spec.name } : {}),
  };
}

function toSessionRecord(spec: WorkerSpec, patch: Partial<SessionRecord>): SessionRecord {
  return {
    id: spec.id,
    command: spec.displayCommand ?? spec.command,
    cwd: spec.cwd,
    socketPath: spec.socketPath,
    workerPid: process.pid,
    name: spec.name,
    ...patch,
  };
}

async function persistRunning(spec: WorkerSpec, pid: number): Promise<void> {
  const existing = await readSessionById(spec.id);
  const now = new Date().toISOString();

  await upsertSession(
    toSessionRecord(spec, {
      startedAt: existing?.startedAt ?? spec.startedAt,
      lastActiveAt: now,
      status: 'running',
      exitCode: null,
      pid,
    }),
  );
}

async function persistExited(spec: WorkerSpec): Promise<void> {
  const existing = await readSessionById(spec.id);
  const now = new Date().toISOString();

  await upsertSession(
    toSessionRecord(spec, {
      startedAt: existing?.startedAt ?? spec.startedAt,
      lastActiveAt: now,
      status: 'exited',
      exitCode,
      pid: existing?.pid,
    }),
  );

  const activeSessionId = await readActiveSessionId();

  if (activeSessionId === spec.id) {
    await writeActiveSessionId(null);
  }
}

function appendOutput(chunk: string): void {
  const normalizedChunk = chunk.replace(/\r/g, '');
  const next = `${outputBuffer}${normalizedChunk}`;

  if (next.length > MAX_SNAPSHOT_CHARS) {
    outputBuffer = next.slice(-MAX_SNAPSHOT_CHARS);
    return;
  }

  outputBuffer = next;
}

function tailOutput(lines: number): string {
  const requestedLines = Number.isFinite(lines) && lines > 0 ? Math.floor(lines) : 20;
  const parts = outputBuffer.split('\n');

  if (parts[parts.length - 1] === '') {
    parts.pop();
  }

  return parts.slice(-requestedLines).join('\n');
}

function sendResponse(socket: net.Socket, response: IpcResponse): void {
  socket.write(`${JSON.stringify(response)}\n`, () => {
    socket.end();
  });
}

function requestKill(): void {
  if (!ptyProcess || killRequested || exited) {
    return;
  }

  killRequested = true;

  try {
    ptyProcess.kill('SIGTERM');
  } catch {
    // ignore and fallback to SIGKILL timer
  }

  setTimeout(() => {
    if (!ptyProcess || exited) {
      return;
    }

    try {
      ptyProcess.kill('SIGKILL');
    } catch {
      // ignore
    }
  }, TERM_TIMEOUT_MS);
}

function handleRequest(socket: net.Socket, request: IpcRequest): void {
  if (!ptyProcess || exited) {
    sendResponse(socket, { ok: false, error: 'session is not running' });
    return;
  }

  try {
    if (request.method === 'text') {
      if (typeof request.payload !== 'string') {
        throw new Error('payload is required');
      }

      ptyProcess.write(request.payload);
      sendResponse(socket, { ok: true, result: true });
      return;
    }

    if (request.method === 'key') {
      if (typeof request.keyName !== 'string') {
        throw new Error('keyName is required');
      }

      ptyProcess.write(resolveKeyInput(request.keyName));
      sendResponse(socket, { ok: true, result: true });
      return;
    }

    if (request.method === 'get') {
      sendResponse(socket, { ok: true, result: tailOutput(request.lines ?? 20) });
      return;
    }

    if (request.method === 'kill') {
      sendResponse(socket, { ok: true, result: true });
      requestKill();
      return;
    }

    throw new Error(`unsupported method: ${String(request.method)}`);
  } catch (error) {
    sendResponse(socket, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function startServer(spec: WorkerSpec): net.Server {
  const ipcServer = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');

      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();

      if (!line) {
        sendResponse(socket, { ok: false, error: 'empty request' });
        return;
      }

      let request: IpcRequest;

      try {
        request = JSON.parse(line) as IpcRequest;
      } catch {
        sendResponse(socket, { ok: false, error: 'invalid request JSON' });
        return;
      }

      handleRequest(socket, request);
    });

    socket.on('error', () => {
      socket.destroy();
    });
  });

  ipcServer.on('error', (error) => {
    if (!ipcServer.listening) {
      console.error(`[agentty worker] failed to listen on socket ${spec.socketPath}:`, error);
    } else {
      console.error('[agentty worker] IPC server error:', error);
    }

    process.exitCode = 1;
  });

  return ipcServer;
}

async function cleanupSocket(socketPath: string): Promise<void> {
  await rm(socketPath, { force: true });
}

async function ensureNodePtySpawnHelperExecutable(): Promise<void> {
  if (process.platform !== 'darwin') {
    return;
  }

  let nodePtyRoot: string;

  try {
    nodePtyRoot = path.dirname(require.resolve('node-pty/package.json'));
  } catch (error) {
    console.warn('[agentty worker] could not resolve node-pty root for spawn-helper check:', error);
    return;
  }

  const spawnHelperPaths = [
    path.join(nodePtyRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    path.join(nodePtyRoot, 'build', 'Release', 'spawn-helper'),
  ];

  for (const spawnHelperPath of spawnHelperPaths) {
    let helperStat;

    try {
      helperStat = await stat(spawnHelperPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code !== 'ENOENT') {
        console.warn(`[agentty worker] could not inspect spawn-helper at ${spawnHelperPath}:`, error);
      }

      continue;
    }

    if (!helperStat.isFile()) {
      continue;
    }

    if ((helperStat.mode & 0o111) !== 0) {
      return;
    }

    try {
      await chmod(spawnHelperPath, 0o755);
      return;
    } catch (error) {
      console.warn(`[agentty worker] could not chmod spawn-helper at ${spawnHelperPath}:`, error);
    }
  }
}

async function main(): Promise<void> {
  const spec = parseWorkerSpec();
  const shell = process.env.SHELL || '/bin/bash';

  await ensureSocketsRoot();
  await cleanupSocket(spec.socketPath);

  server = startServer(spec);

  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject);
    server?.listen(spec.socketPath, () => {
      server?.off('error', reject);
      resolve();
    });
  });

  await ensureNodePtySpawnHelperExecutable();

  ptyProcess = Array.isArray(spec.args)
    ? spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: process.env,
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
      })
    : spawn(shell, ['-lc', spec.command], {
        cwd: spec.cwd,
        env: process.env,
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
      });

  ptyProcess.onData?.((chunk) => {
    appendOutput(chunk);
  });

  const runningPersistPromise = persistRunning(spec, ptyProcess.pid);

  ptyProcess.onExit(async ({ exitCode: rawExitCode }) => {
    exited = true;
    exitCode = rawExitCode ?? null;

    try {
      await runningPersistPromise.catch(() => {
        // ignore persistence race; exit persistence below is authoritative
      });
      await persistExited(spec);
    } finally {
      server?.close();
      await cleanupSocket(spec.socketPath);
      process.exit(0);
    }
  });

  await runningPersistPromise;

  const shutdown = (): void => {
    requestKill();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(async (error) => {
  console.error('[agentty worker] startup failed:', error);

  try {
    const spec = parseWorkerSpec();
    await cleanupSocket(spec.socketPath);
  } catch {
    // best-effort cleanup
  }

  process.exit(1);
});
