import { readActiveSessionId, readSessionById, writeActiveSessionId } from './state';

async function ensureRunningSession(sessionId: string): Promise<void> {
  const session = await readSessionById(sessionId);

  if (!session || session.status !== 'running') {
    throw new Error(`session is not running: ${sessionId}`);
  }
}

export async function attachSession(id: string): Promise<void> {
  await ensureRunningSession(id);
  await writeActiveSessionId(id);
}

export async function resolveTargetSessionId(explicitId?: string): Promise<string> {
  if (explicitId !== undefined) {
    return explicitId;
  }

  const activeSessionId = await readActiveSessionId();

  if (!activeSessionId) {
    throw new Error('no active session');
  }

  return activeSessionId;
}
