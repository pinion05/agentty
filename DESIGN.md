# Agentty v0 Design (Thin Layer)

## 1) Goal
`agentty` is a terminal control CLI for **LLM agents that cannot natively handle interactive TTY workflows**.

v0 goal:
- Install with `npm -g i ...` and use immediately
- Keep architecture minimal (thin layer)
- Support interactive flows like `vim`, `python REPL`

## 2) Product Principles
- Thin layer first: minimum abstraction, minimum options
- Agent-first UX: commands that are easy to call from tools
- Deterministic behavior over feature breadth
- No setup wizard, no post-install prompts

## 3) Scope (v0)
### Supported platform
- macOS first

### Commands
- `help`
- `status`
- `start`
- `attach`
- `get`
- `text`
- `key`
- `kill`

### Out of scope (v0)
- Full visual attach session takeover
- Rich ANSI/raw rendering in `get`
- Multi-host/remote transport
- Plugin system

## 4) Command Semantics
## `start`
Create a new PTY-backed session.

Input:
- command (required)
- cwd (optional)
- name (optional)

Output:
- session id

## `attach`
Set current active session pointer (for continuity). 
**No terminal take-over.**

Input:
- session id

Output:
- active session id

## `get`
Get session snapshot output.

Input:
- optional session id (fallback: active)
- optional line limit

Output:
- text tail only (no raw ANSI in v0)

## `text`
Send plain text to session stdin.

Input:
- optional session id (fallback: active)
- text payload

Output:
- success/fail

## `key`
Send interactive keys to session stdin.

Input:
- optional session id (fallback: active)
- key enum (`Enter`, `Tab`, `Up`, `Down`, `Left`, `Right`, `Esc`, `Ctrl+C`, ...)

Output:
- success/fail

## `kill`
Terminate session.

Input:
- optional session id (fallback: active)

Output:
- success/fail

## `status`
Return runtime info + session list.

Output:
- text by default
- `--json` for machine-readable mode

## 5) Error Rules
- If a command requires session and neither `--session` nor active session exists:
  - return `no active session`
- `kill` on non-existing session:
  - return clear not-found error

## 6) Data Model (Minimal)
Storage root:
- `~/.agentty/`

Files:
- `sessions.json` — session metadata list
- `active` — active session id pointer

Session fields:
- `id`
- `pid`
- `command`
- `cwd`
- `startedAt`
- `lastActiveAt`
- `status` (`running` | `exited`)
- `exitCode` (nullable)

## 7) Runtime Architecture (v0)
Single-process CLI runtime (no daemon yet):
1. Load state from `~/.agentty`
2. Resolve target session (explicit id or active pointer)
3. Execute action against PTY process
4. Persist state
5. Return text / JSON response

Rationale:
- fastest path to usable v0
- keeps failure surfaces small
- daemon can be added in v1 without breaking command UX

## 8) DX Requirements
- `npm -g i` then immediate use
- no interactive setup
- `help --json` should expose command contract for agents
- predictable outputs for parser-friendly automation

## 9) v0 Acceptance Criteria
1. Global install succeeds on macOS
2. `start -> text/key -> get -> kill` roundtrip succeeds
3. Interactive sample passes:
   - Python REPL interaction
   - Vim interaction (command/exit level)
4. Clear errors for missing active session
5. `status` supports text + `--json`

## 10) Example Agent Flow
```bash
agentty start --name py -- python3 -i
agentty attach py
agentty text "print(2+2)"
agentty key Enter
agentty get --lines 20
agentty key Ctrl+D
agentty kill
```

---
This design intentionally prioritizes thin-layer reliability over feature breadth.
