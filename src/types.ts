export interface SessionRecord {
  id: string;
  [key: string]: unknown;
}

export type SessionRecordList = SessionRecord[];
export type ActiveSessionId = string | null;
