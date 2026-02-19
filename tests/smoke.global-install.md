# Global install smoke

Date: 2026-02-19 (Asia/Seoul)
Repo: `/home/pinion/.openclaw/workspace/agentty`

- npm package: `agentty-cli`
- installed binary: `agentty`

## Environment isolation used

```bash
PREFIX=$(mktemp -d)
SMOKE_HOME=$(mktemp -d)
export NPM_CONFIG_PREFIX="$PREFIX"
export PATH="$PREFIX/bin:$PATH"
export HOME="$SMOKE_HOME"
```

This keeps the smoke install out of the real global npm prefix.

## Commands and outputs

### 1) Build

```bash
$ npm run build

> agentty-cli@0.0.1 build
> tsup

CLI Building entry: src/index.ts, src/worker.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: /home/pinion/.openclaw/workspace/agentty/tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
CJS Build start
CJS dist/index.js  20.47 KB
CJS dist/worker.js 11.20 KB
CJS ⚡️ Build success in 10ms
```

### 2) Pack

```bash
$ npm pack
npm notice
npm notice 📦  agentty-cli@0.0.1
npm notice Tarball Contents
npm notice 597B README.md
npm notice 21.0kB dist/index.js
npm notice 11.5kB dist/worker.js
npm notice 497B package.json
npm notice Tarball Details
npm notice name: agentty-cli
npm notice version: 0.0.1
npm notice filename: agentty-cli-0.0.1.tgz
npm notice package size: 7.3 kB
npm notice unpacked size: 33.5 kB
npm notice total files: 4
npm notice
agentty-cli-0.0.1.tgz
```

### 3) Isolated global install

```bash
$ env NPM_CONFIG_PREFIX="$PREFIX" PATH="$PREFIX/bin:$PATH" HOME="$SMOKE_HOME" npm i -g ./agentty-cli-0.0.1.tgz
```

### 4) `agentty help`

```bash
$ env NPM_CONFIG_PREFIX="$PREFIX" PATH="$PREFIX/bin:$PATH" HOME="$SMOKE_HOME" agentty help
agentty v0

Commands:
  help   Show help
  status Show runtime status
  start  Start a session
  attach Set active session
  get    Read output tail
  text   Send text input
  key    Send key input
  kill   Kill a session
```

### 5) `agentty status --json`

```bash
$ env NPM_CONFIG_PREFIX="$PREFIX" PATH="$PREFIX/bin:$PATH" HOME="$SMOKE_HOME" agentty status --json
{
  "runtime": {
    "pid": 1405170,
    "node": "v24.12.0",
    "cwd": "/home/pinion/.openclaw/workspace/agentty",
    "platform": "linux"
  },
  "sessions": []
}
```

## Caveats

- `pid` is process-specific and changes on each run.
- `cwd` reflects the shell location where `agentty` is executed.
- npm may print update notices; not a smoke failure.
