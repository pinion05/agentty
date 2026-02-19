import { readActiveSessionId, writeActiveSessionId } from './state';

export async function attachSession(id: string): Promise<void> {
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
