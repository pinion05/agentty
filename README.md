# agentty

Thin CLI for driving interactive terminal sessions from agents.
AI agents can handle interactive CLIs here without getting stuck in pending states, just like they do with agent-browser.

- npm package: `agentty-cli`
- installed binary: `agentty`

## Install

```bash
npm i -g agentty-cli
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
