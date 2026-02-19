import { buildHelpText, helpSchema } from './helpSchema';
import { attachSession, resolveTargetSessionId } from './resolveSession';
import { getSnapshot, killSession, sendKey, sendText } from './sessionRuntime';
import { readSessions } from './state';

const helpText = buildHelpText();

interface SessionOptionResult {
  sessionId?: string;
  remaining: string[];
}

interface GetOptionResult extends SessionOptionResult {
  lines: number;
}

function parseJsonFlag(command: string, args: string[]): boolean {
  let json = false;

  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }

    throw new Error(`${command} does not accept positional arguments`);
  }

  return json;
}

function parseSessionOption(args: string[]): SessionOptionResult {
  const remaining: string[] = [];
  let sessionId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--session') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('--session requires a value');
      }

      sessionId = value;
      index += 1;
      continue;
    }

    remaining.push(arg);
  }

  return {
    sessionId,
    remaining,
  };
}

function parseGetOptions(args: string[]): GetOptionResult {
  const remaining: string[] = [];
  let sessionId: string | undefined;
  let lines = 20;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--session') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('--session requires a value');
      }

      sessionId = value;
      index += 1;
      continue;
    }

    if (arg === '--lines') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('--lines requires a value');
      }

      const parsed = Number.parseInt(value, 10);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--lines must be a positive integer');
      }

      lines = parsed;
      index += 1;
      continue;
    }

    remaining.push(arg);
  }

  return {
    sessionId,
    lines,
    remaining,
  };
}

function formatStatusText(sessions: Array<{ id: string; status?: unknown }>): string {
  const runtime = {
    pid: process.pid,
    node: process.version,
    cwd: process.cwd(),
    platform: process.platform,
  };

  const lines = [
    'runtime',
    `  pid: ${runtime.pid}`,
    `  node: ${runtime.node}`,
    `  cwd: ${runtime.cwd}`,
    `  platform: ${runtime.platform}`,
    `sessions: ${sessions.length}`,
  ];

  if (sessions.length === 0) {
    lines.push('  (none)');
  } else {
    for (const session of sessions) {
      const status = typeof session.status === 'string' ? session.status : 'unknown';
      lines.push(`  - ${session.id} (${status})`);
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command) {
    console.log(helpText);
    return;
  }

  if (command === 'help') {
    const json = parseJsonFlag('help', process.argv.slice(3));

    if (json) {
      console.log(JSON.stringify(helpSchema, null, 2));
      return;
    }

    console.log(helpText);
    return;
  }

  if (command === 'status') {
    const sessions = await readSessions();
    const runtime = {
      pid: process.pid,
      node: process.version,
      cwd: process.cwd(),
      platform: process.platform,
    };

    const json = parseJsonFlag('status', process.argv.slice(3));

    if (json) {
      console.log(
        JSON.stringify(
          {
            runtime,
            sessions,
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(formatStatusText(sessions));
    return;
  }

  if (command === 'attach') {
    const sessionId = process.argv[3];

    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    await attachSession(sessionId);
    console.log(sessionId);
    return;
  }

  if (command === 'get') {
    const { sessionId, lines, remaining } = parseGetOptions(process.argv.slice(3));

    if (remaining.length > 0) {
      throw new Error('get does not accept positional arguments');
    }

    const targetSessionId = await resolveTargetSessionId(sessionId);
    const snapshot = await getSnapshot(targetSessionId, lines);

    if (snapshot.length > 0) {
      console.log(snapshot);
    }

    return;
  }

  if (command === 'text') {
    const { sessionId, remaining } = parseSessionOption(process.argv.slice(3));

    if (remaining.length === 0) {
      throw new Error('payload is required');
    }

    const targetSessionId = await resolveTargetSessionId(sessionId);
    await sendText(targetSessionId, remaining.join(' '));
    return;
  }

  if (command === 'key') {
    const { sessionId, remaining } = parseSessionOption(process.argv.slice(3));

    if (remaining.length !== 1) {
      throw new Error('exactly one keyName is required');
    }

    const targetSessionId = await resolveTargetSessionId(sessionId);
    await sendKey(targetSessionId, remaining[0]);
    return;
  }

  if (command === 'kill') {
    const { sessionId, remaining } = parseSessionOption(process.argv.slice(3));

    if (remaining.length > 0) {
      throw new Error('kill does not accept positional arguments');
    }

    const targetSessionId = await resolveTargetSessionId(sessionId);
    await killSession(targetSessionId);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exit(1);
});
