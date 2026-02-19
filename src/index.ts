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

const command = process.argv[2];

if (!command || command === 'help') {
  console.log(helpText);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
process.exit(1);
