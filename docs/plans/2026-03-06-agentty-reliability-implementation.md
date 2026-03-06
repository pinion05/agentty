# Agentty Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the highest-priority reliability and CLI contract issues in `agentty` without broad refactoring.

**Architecture:** Tighten the session startup contract so `start` preserves argv boundaries and only reports success once the PTY is ready. Add cross-process state serialization so concurrent CLI invocations do not lose session records. Validate `attach` targets and make `kill` fail when the session has not actually exited.

**Tech Stack:** TypeScript, Vitest, node-pty, execa

---

### Task 1: Preserve argv boundaries and delay `start` success until PTY readiness

**Files:**
- Modify: `src/index.ts`
- Modify: `src/sessionRuntime.ts`
- Modify: `src/worker.ts`
- Modify: `src/ipc.ts`
- Test: `tests/sessionRuntime.start.test.ts`
- Test: `tests/e2e.start-argv.test.ts`

**Steps:**
1. Write a failing test that proves `start` preserves quoted and empty argv entries.
2. Run the targeted test and confirm it fails for the expected reason.
3. Write a failing test that proves `startSession()` returns the PTY pid rather than the worker pid.
4. Run the targeted test and confirm it fails.
5. Implement the minimal `file + args[]` start contract and a worker readiness handshake.
6. Re-run the targeted tests until green.

### Task 2: Prevent session state loss across concurrent CLI invocations

**Files:**
- Modify: `src/state.ts`
- Test: `tests/e2e.concurrent-start.test.ts`

**Steps:**
1. Write a failing concurrency test that starts multiple sessions in parallel and asserts all session records remain present.
2. Run the targeted test and confirm it fails.
3. Add minimal cross-process state serialization around shared state mutations.
4. Re-run the targeted test until green.

### Task 3: Tighten `attach` validation and `kill` semantics

**Files:**
- Modify: `src/resolveSession.ts`
- Modify: `src/sessionRuntime.ts`
- Modify: `tests/attach.test.ts`
- Modify: `tests/kill.test.ts`

**Steps:**
1. Write failing tests for attaching nonexistent or exited sessions.
2. Run the targeted test and confirm it fails.
3. Write a failing unit test that proves `killSession()` should reject when exit confirmation never arrives.
4. Run the targeted test and confirm it fails.
5. Implement minimal validation for `attach` and make `kill` timeout explicit.
6. Re-run the targeted tests until green.

### Task 4: Verify the full suite

**Files:**
- Test: `tests/*.test.ts`

**Steps:**
1. Run the full test suite in the same environment used for real `agentty` socket access.
2. Confirm exit code `0` and zero failing tests.
3. Review diffs for unintended changes before reporting completion.
