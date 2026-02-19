export type SessionStatus = 'running' | 'exited';

export interface SessionRecord {
  id: string;
  pid?: number;
  workerPid?: number;
  command?: string;
  cwd?: string;
  startedAt?: string;
  lastActiveAt?: string;
  status?: SessionStatus;
  exitCode?: number | null;
  socketPath?: string;
  name?: string;
  [key: string]: unknown;
}

export type SessionRecordList = SessionRecord[];
export type ActiveSessionId = string | null;
