# Global install smoke (Task 10)

Date: 2026-02-19 (Asia/Seoul)
Repo: `/home/pinion/.openclaw/workspace/agentty`

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

> agentty@0.0.0 build
> tsup

CLI Building entry: src/index.ts
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: /home/pinion/.openclaw/workspace/agentty/tsup.config.ts
CLI Target: node20
CLI Cleaning output folder
CJS Build start
CJS dist/index.js 17.81 KB
CJS ⚡️ Build success in 8ms
```

### 2) Pack

```bash
$ npm pack
npm notice
npm notice 📦  agentty@0.0.0
npm notice Tarball Contents
npm notice 548B README.md
npm notice 18.2kB dist/index.js
npm notice 512B package.json
npm notice Tarball Details
npm notice name: agentty
npm notice version: 0.0.0
npm notice filename: agentty-0.0.0.tgz
npm notice package size: 5.4 kB
npm notice unpacked size: 19.3 kB
npm notice shasum: 76368e248f1890cbce83ca710ad83d2154cb3a44
npm notice integrity: sha512-k2xr0QCoXOCcB[...]Qs0UbMLVdexkg==
npm notice total files: 3
npm notice
agentty-0.0.0.tgz
```

### 3) Isolated global install

```bash
$ env NPM_CONFIG_PREFIX="$PREFIX" PATH="$PREFIX/bin:$PATH" HOME="$SMOKE_HOME" npm i -g ./agentty-0.0.0.tgz

added 3 packages in 5s
npm notice
npm notice New minor version of npm available! 11.6.2 -> 11.10.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.10.0
npm notice To update run: npm install -g npm@11.10.0
npm notice
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
    "pid": 1388620,
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
