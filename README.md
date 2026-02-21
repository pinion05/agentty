# agentty

**Website:** https://pinion05.github.io/agentty/

Thin CLI for driving interactive terminal sessions from agents.
AI agents can handle interactive CLIs here without getting stuck in pending states, just like they do with agent-browser.

- npm package: `agentty-cli`
- installed binary: `agentty`

## For AI Agents

This CLI is meant to be used directly by AI agents.
For agents, a single instruction like "Install https://github.com/pinion05/agentty" is enough to bootstrap the environment.
Use built-in tools by default. If an interactive CLI is required or a timeout occurs, use `agentty` to complete the task.

## Run with npx

```bash
npx agentty-cli status --json
```

## First check

```bash
agentty status --json
```

## Quickstart

```bash
# 1) start a session (example: Python REPL)
agentty start --name py -- python3 -i

# 2) attach active session pointer
agentty attach <sessionId>

# 3) send input
agentty text "print(2+2)"
agentty key Enter

# 4) read output tail
agentty get --lines 20

# 5) stop session
agentty kill
```

## Troubleshooting

If `agentty start` fails before a socket appears, check the worker log:

- default: `~/.agentty/logs/<sessionId>.log`
- custom home (`AGENTTY_HOME`): `$AGENTTY_HOME/logs/<sessionId>.log`

macOS note: if you previously saw `posix_spawnp failed` from `node-pty` startup, update to `agentty-cli >= 0.0.5` (agentty now self-heals by chmodding `spawn-helper` at runtime).

## Supported keys

`agentty key <keyName>` supports:

Special keys:
- `Enter`
- `Tab`
- `Up`
- `Down`
- `Left`
- `Right`
- `Esc`
- `Ctrl+C`
- `Ctrl+D`

Single-character keys:
- Any 1-character key name is sent as-is (e.g. `i` for Vim insert mode, `:` for command mode, `q`, `!`, space, etc.).
