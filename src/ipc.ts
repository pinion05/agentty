import net from 'node:net';

export type IpcMethod = 'text' | 'key' | 'get' | 'kill';

export interface IpcRequest {
  method: IpcMethod;
  payload?: string;
  keyName?: string;
  lines?: number;
}

interface IpcResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

const CONNECT_RETRY_MS = 50;
const CONNECT_TIMEOUT_MS = 3_000;
const ATTEMPT_TIMEOUT_MS = 800;

function isTransientIpcError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'ENOENT' || code === 'ECONNREFUSED' || code === 'EPIPE' || code === 'ENOTCONN';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce(socketPath: string, request: IpcRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    let buffer = '';

    const finish = (handler: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      handler();
    };

    const timeout = setTimeout(() => {
      finish(() => {
        reject(new Error('IPC request timed out'));
      });
    }, ATTEMPT_TIMEOUT_MS);

    socket.on('error', (error) => {
      clearTimeout(timeout);
      finish(() => {
        reject(error);
      });
    });

    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');

      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();

      clearTimeout(timeout);
      finish(() => {
        if (!line) {
          reject(new Error('empty IPC response'));
          return;
        }

        let response: IpcResponse;

        try {
          response = JSON.parse(line) as IpcResponse;
        } catch {
          reject(new Error('invalid IPC response'));
          return;
        }

        if (!response.ok) {
          reject(new Error(response.error || 'IPC request failed'));
          return;
        }

        resolve(response.result);
      });
    });
  });
}

export async function requestIpc(socketPath: string, request: IpcRequest): Promise<unknown> {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await requestOnce(socketPath, request);
    } catch (error) {
      lastError = error;

      if (!isTransientIpcError(error) && (error as Error).message !== 'IPC request timed out') {
        throw error;
      }

      await sleep(CONNECT_RETRY_MS);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('IPC request failed');
}
