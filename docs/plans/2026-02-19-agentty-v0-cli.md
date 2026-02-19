# Agentty v0 CLI Implementation Plan

> **For Claude:** Use `${CLAUDE_PLUGIN_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Build a thin-layer `agentty` CLI that lets LLM agents control interactive terminal sessions via `help/status/start/attach/get/text/key/kill`.

**Architecture:** Use a single-process CLI runtime (no daemon in v0) with PTY-backed sessions and minimal file-based state in `~/.agentty/`. Commands resolve an explicit `--session` or active session pointer and return deterministic text output by default with optional `--json` for parser-friendly agent use.

**Tech Stack:** Node.js 20+, TypeScript, Commander, node-pty prebuilt package, Vitest, tsup.

---

### Task 1: Bootstrap CLI package and test harness

**Files:**
- Create: `agentty/package.json`
- Create: `agentty/tsconfig.json`
- Create: `agentty/tsup.config.ts`
- Create: `agentty/src/index.ts`
- Create: `agentty/tests/cli.help.test.ts`

**Step 1: Write the failing test**

```ts
import { execa } from 'execa';
import { describe, it, expect } from 'vitest';

describe('help', () => {
  it('prints command list', async () => {
    const { stdout } = await execa('node', ['dist/index.js', 'help']);
    expect(stdout).toContain('start');
    expect(stdout).toContain('attach');
    expect(stdout).toContain('key');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd agentty && npm test -- tests/cli.help.test.ts`
Expected: FAIL because `dist/index.js` does not exist.

**Step 3: Write minimal implementation**

Create minimal `src/index.ts` that prints static help text.

**Step 4: Run test to verify it passes**

Run: `cd agentty && npm run build && npm test -- tests/cli.help.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add agentty/package.json agentty/tsconfig.json agentty/tsup.config.ts agentty/src/index.ts agentty/tests/cli.help.test.ts
git commit -m "chore(agentty): bootstrap cli package and help smoke test"
```

---

### Task 2: Add state layer for `~/.agentty`

**Files:**
- Create: `agentty/src/state.ts`
- Create: `agentty/src/types.ts`
- Create: `agentty/tests/state.test.ts`

**Step 1: Write the failing test**

```ts
it('creates state dir and active pointer files', async () => {
  // use temp HOME
  // initState() should create ~/.agentty and sessions.json if missing
});
```

**Step 2: Run test to verify it fails**

Run: `cd agentty && npm test -- tests/state.test.ts`
Expected: FAIL because `state.ts` missing.

**Step 3: Write minimal implementation**

Implement:
- `getStateRoot()`
- `readSessions()` / `writeSessions()`
- `readActiveSessionId()` / `writeActiveSessionId()`

**Step 4: Run test to verify it passes**

Run: `cd agentty && npm test -- tests/state.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add agentty/src/state.ts agentty/src/types.ts agentty/tests/state.test.ts
git commit -m "feat(agentty): add minimal file-based state layer"
```

---

### Task 3: Session runtime manager (PTY spawn + metadata)

**Files:**
- Create: `agentty/src/sessionRuntime.ts`
- Create: `agentty/tests/sessionRuntime.start.test.ts`

**Step 1: Write the failing test**

```ts
it('start creates running session metadata', async () => {
  // startSession('python3 -i')
  // assert sessions.json contains id, pid, status=running
});
```

**Step 2: Run test to verify it fails**

Run: `cd agentty && npm test -- tests/sessionRuntime.start.test.ts`
Expected: FAIL because runtime functions do not exist.

**Step 3: Write minimal implementation**

Implement `startSession({command,cwd,name})` with node-pty spawn and metadata persistence.

**Step 4: Run test to verify it passes**

Run: `cd agentty && npm test -- tests/sessionRuntime.start.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add agentty/src/sessionRuntime.ts agentty/tests/sessionRuntime.start.test.ts
git commit -m "feat(agentty): implement pty session start runtime"
```

---

### Task 4: `attach` and target-session resolution

**Files:**
- Create: `agentty/src/resolveSession.ts`
- Modify: `agentty/src/index.ts`
- Create: `agentty/tests/attach.test.ts`

**Step 1: Write the failing test**

```ts
it('attach sets active pointer and get/text/key resolve it', async () => {
  // attach(sessionId)
  // assert active file == sessionId
});
```

**Step 2: Run test to verify it fails**

Run: `cd agentty && npm test -- tests/attach.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement:
- `attachSession(id)`
- `resolveTargetSessionId(explicitId)`
- error: `no active session`

**Step 4: Run test to verify it passes**

Run: `cd agentty && npm test -- tests/attach.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add agentty/src/resolveSession.ts agentty/src/index.ts agentty/tests/attach.test.ts
git commit -m "feat(agentty): add attach pointer and session resolution"
```

---

### Task 5: `text` and `key` input delivery

**Files:**
- Modify: `agentty/src/sessionRuntime.ts`
- Modify: `agentty/src/index.ts`
- Create: `agentty/src/keymap.ts`
- Create: `agentty/tests/input.test.ts`

**Step 1: Write the failing test**

```ts
it('text writes plain string and key Enter sends CR', async () => {
  // start python repl session
  // text "print(2+2)"
  // key Enter
  // get should include 4
});
```

**Step 2: Run test to verify it fails**

Run: `cd agentty && npm test -- tests/input.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement:
- `sendText(sessionId, payload)`
- `sendKey(sessionId, keyName)`
- key map: `Enter, Tab, Up, Down, Left, Right, Esc, Ctrl+C, Ctrl+D`

**Step 4: Run test to verify it passes**

Run: `cd agentty && npm test -- tests/input.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add agentty/src/sessionRuntime.ts agentty/src/index.ts agentty/src/keymap.ts agentty/tests/input.test.ts
git commit -m "feat(agentty): implement text/key input channel"
```

---

### Task 6: `get` tail snapshot (text-only)

**Files:**
- Modify: `agentty/src/sessionRuntime.ts`
- Modify: `agentty/src/index.ts`
- Create: `agentty/tests/get.test.ts`

**Step 1: Write the failing test**

```ts
it('get returns text tail only with line limit', async () => {
  // feed multi-line output
  // get --lines 3 returns exactly last 3 lines
});
```

**Step 2: Run test to verify it fails**

Run: `cd agentty && npm test -- tests/get.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement:
- in-memory ring buffer per session
- `getSnapshot(sessionId, lines)` returns plain text tail

**Step 4: Run test to verify it passes**

Run: `cd agentty && npm test -- tests/get.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add agentty/src/sessionRuntime.ts agentty/src/index.ts agentty/tests/get.test.ts
git commit -m "feat(agentty): add text-only tail snapshot for get"
```

---

### Task 7: `kill` lifecycle and cleanup

**Files:**
- Modify: `agentty/src/sessionRuntime.ts`
- Modify: `agentty/src/index.ts`
- Create: `agentty/tests/kill.test.ts`

**Step 1: Write the failing test**

```ts
it('kill terminates session and updates metadata', async () => {
  // start -> kill -> status should be exited
});
```

**Step 2: Run test to verify it fails**

Run: `cd agentty && npm test -- tests/kill.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement:
- `killSession` with TERM then KILL fallback
- metadata status update
- clear active pointer if killed session was active

**Step 4: Run test to verify it passes**

Run: `cd agentty && npm test -- tests/kill.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add agentty/src/sessionRuntime.ts agentty/src/index.ts agentty/tests/kill.test.ts
git commit -m "feat(agentty): implement kill lifecycle and pointer cleanup"
```

---

### Task 8: `status` text + `--json`, and `help --json`

**Files:**
- Modify: `agentty/src/index.ts`
- Create: `agentty/src/helpSchema.ts`
- Create: `agentty/tests/status-help-json.test.ts`

**Step 1: Write the failing test**

```ts
it('status --json returns runtime and sessions', async () => {
  // assert parsable json and expected fields
});

it('help --json returns command contract', async () => {
  // assert includes help/status/start/attach/get/text/key/kill
});
```

**Step 2: Run test to verify it fails**

Run: `cd agentty && npm test -- tests/status-help-json.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Add:
- `status` default text formatter
- `status --json`
- `help --json` machine-readable command schema

**Step 4: Run test to verify it passes**

Run: `cd agentty && npm test -- tests/status-help-json.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add agentty/src/index.ts agentty/src/helpSchema.ts agentty/tests/status-help-json.test.ts
git commit -m "feat(agentty): add status/help json mode for agent parsing"
```

---

### Task 9: E2E acceptance tests (Python REPL + Vim)

**Files:**
- Create: `agentty/tests/e2e.python-repl.test.ts`
- Create: `agentty/tests/e2e.vim.test.ts`
- Modify: `agentty/package.json`

**Step 1: Write the failing Python REPL E2E test**

```ts
it('python repl interaction works end-to-end', async () => {
  // start python3 -i
  // attach
  // text print(2+2)
  // key Enter
  // get contains 4
  // key Ctrl+D / kill
});
```

**Step 2: Write the failing Vim E2E test**

```ts
it('vim interaction works end-to-end', async () => {
  // start vim
  // key i, text hello, key Esc
  // text :q!, key Enter
  // kill fallback if needed
});
```

**Step 3: Run E2E tests to verify failure**

Run: `cd agentty && npm run test:e2e`
Expected: FAIL initially.

**Step 4: Fix minimal issues until both pass**

Adjust key handling and timing waits only where necessary.

**Step 5: Commit**

```bash
git add agentty/tests/e2e.python-repl.test.ts agentty/tests/e2e.vim.test.ts agentty/package.json
git commit -m "test(agentty): add e2e acceptance for python repl and vim"
```

---

### Task 10: Packaging and global-install smoke check

**Files:**
- Modify: `agentty/package.json`
- Create: `agentty/README.md`
- Create: `agentty/tests/smoke.global-install.md`

**Step 1: Add global bin config and scripts**

```json
{
  "name": "agentty",
  "bin": { "agentty": "dist/index.js" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run"
  }
}
```

**Step 2: Add minimal README quickstart**

Include:
- install
- first `status`
- start/attach/text/key/get/kill examples

**Step 3: Run local global-install smoke**

Run:
```bash
cd agentty
npm run build
npm pack
npm -g i ./agentty-*.tgz
agentty help
agentty status --json
```
Expected: commands execute successfully.

**Step 4: Document smoke output**

Save command outputs and known caveats in `tests/smoke.global-install.md`.

**Step 5: Commit**

```bash
git add agentty/package.json agentty/README.md agentty/tests/smoke.global-install.md
git commit -m "chore(agentty): finalize global install packaging and smoke docs"
```

---

## Final Verification Checklist
- `npm test` passes
- `npm run test:e2e` passes on macOS
- `agentty status` (text) works
- `agentty status --json` works
- `help --json` contains full command schema
- `no active session` behavior is enforced consistently
- `get` remains text-tail only in v0
