import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

describe('help', () => {
  it('prints command list', async () => {
    const { stdout } = await execa('node', ['dist/index.js', 'help']);

    expect(stdout).toContain('start');
    expect(stdout).toContain('attach');
    expect(stdout).toContain('key');
  });
});
