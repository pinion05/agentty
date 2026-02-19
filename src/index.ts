import { attachSession, resolveTargetSessionId } from './resolveSession';
import { sendKey, sendText } from './sessionRuntime';

const helpText = `agentty v0

Commands:
  help    Show help
  status  Show runtime status
  start   Start a session
  attach  Set active session
  get     Read output tail
  text    Send text input
  key     Send key input
  kill    Kill a session
`;

interface SessionOptionResult {
  sessionId?: string;
  remaining: string[];
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

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === 'help') {
    console.log(helpText);
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
