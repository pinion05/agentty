interface CommandOptionSchema {
  name: string;
  value?: string;
  description: string;
}

interface CommandSchema {
  summary: string;
  positional?: string[];
  options?: CommandOptionSchema[];
  supportedKeys?: string[];
}

interface HelpSchema {
  name: string;
  version: string;
  commands: Record<string, CommandSchema>;
}

export const helpSchema: HelpSchema = {
  name: 'agentty',
  version: 'v0',
  commands: {
    help: {
      summary: 'Show help',
      options: [{ name: '--json', description: 'Print machine-readable command schema' }],
    },
    status: {
      summary: 'Show runtime status',
      options: [{ name: '--json', description: 'Print runtime and sessions as JSON' }],
    },
    start: {
      summary: 'Start a session',
      positional: ['command'],
      options: [
        { name: '--cwd', value: 'path', description: 'Working directory for the session' },
        { name: '--name', value: 'label', description: 'Optional session name' },
      ],
    },
    attach: {
      summary: 'Set active session',
      positional: ['sessionId'],
    },
    get: {
      summary: 'Read output tail',
      options: [
        { name: '--session', value: 'sessionId', description: 'Target session id (optional)' },
        { name: '--lines', value: 'n', description: 'Tail line count (default: 20)' },
      ],
    },
    text: {
      summary: 'Send text input',
      positional: ['payload'],
      options: [{ name: '--session', value: 'sessionId', description: 'Target session id (optional)' }],
    },
    key: {
      summary: 'Send key input',
      positional: ['keyName'],
      options: [{ name: '--session', value: 'sessionId', description: 'Target session id (optional)' }],
      supportedKeys: ['Enter', 'Tab', 'Up', 'Down', 'Left', 'Right', 'Esc', 'Ctrl+C', 'Ctrl+D'],
    },
    kill: {
      summary: 'Kill a session',
      options: [{ name: '--session', value: 'sessionId', description: 'Target session id (optional)' }],
    },
  },
};

export function buildHelpText(): string {
  const rows = Object.entries(helpSchema.commands)
    .map(([name, definition]) => `  ${name.padEnd(7)}${definition.summary}`)
    .join('\n');

  const examples = [
    '  agentty start node -i  # or: agentty start python3 -i',
    '  agentty attach <sessionId>',
    '  agentty text "1 + 1"',
    '  agentty key Enter',
    '  agentty get --lines 20',
    '  agentty kill',
  ].join('\n');

  const supportedKeys = 'Enter, Tab, Up, Down, Left, Right, Esc, Ctrl+C, Ctrl+D';

  return `agentty v0\n\nCommands:\n${rows}\n\nExamples:\n${examples}\n\nSupported keys (agentty key <keyName>):\n  Special keys: ${supportedKeys}\n  Single-character key names are accepted and sent as-is.\n`;
}
