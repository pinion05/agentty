const KEY_MAP: Record<string, string> = {
  Enter: '\r',
  Tab: '\t',
  Up: '\u001b[A',
  Down: '\u001b[B',
  Left: '\u001b[D',
  Right: '\u001b[C',
  Esc: '\u001b',
  'Ctrl+C': '\u0003',
  'Ctrl+D': '\u0004',
};

export function resolveKeyInput(keyName: string): string {
  const input = KEY_MAP[keyName];

  if (input) {
    return input;
  }

  if (keyName.length === 1) {
    return keyName;
  }

  throw new Error(`Unsupported key: ${keyName}`);
}
