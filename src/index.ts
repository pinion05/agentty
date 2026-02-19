import { attachSession } from './resolveSession';

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
