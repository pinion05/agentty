import { randomUUID } from 'node:crypto';

import { spawn, type IPty } from 'node-pty';

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

const runtimeSessions = new Map<string, IPty>();

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
  ptyProcess.onExit(() => {
    runtimeSessions.delete(session.id);
  });

  const sessions = await readSessions();

  try {
    await writeSessions([...sessions, session]);
  } catch (error) {
    try {
      ptyProcess.kill();
    } finally {
      runtimeSessions.delete(session.id);
    }

    throw error;
  }

  return session;
}
