# agentty

Thin CLI for driving interactive terminal sessions from agents.

## Install

```bash
npm i -g agentty
# or from local tarball
npm i -g ./agentty-*.tgz
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
