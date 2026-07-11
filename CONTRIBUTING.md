# Contributing to StackPilot

StackPilot is an npm-workspaces preview. Contributions should keep changes narrow, testable, and consistent with the current React, Vite and TypeScript structure. Read [SECURITY.md](SECURITY.md) before reporting security-sensitive behavior.

## Development Environment

Required tools:

- Node.js `^20.19.0` or `>=22.12.0`; CI uses Node.js 22;
- npm 10 or newer;
- Git.

Install the exact locked dependencies:

```bash
npm ci
```

The Controller reads configuration from its process environment; it does not automatically load the root `.env` file. See [README.md](README.md) and [.env.example](.env.example) for the current variables. Start both applications with:

```bash
npm run dev
```

Or start them independently:

```bash
npm run dev:controller
npm run dev:web
```

Workspace ownership:

- `apps/web`: browser application; may import public packages but must not import Controller internals;
- `apps/controller`: strict TypeScript local API, organized into HTTP, business modules, repositories, and platform adapters;
- `apps/agent`: independent non-root TypeScript Agent with a closed read-only task registry; still not a production deployment target;
- `packages/contracts`: application-independent shared API and domain contracts;
- `packages/config`: application-independent shared development defaults.

To install or verify a single workspace from the repository root, use npm's workspace selector, for example `npm install --workspace @stackpilot/web` or `npm run build --workspace @stackpilot/controller`. The root lockfile remains authoritative.

Controller-only type checking is available with `npm run typecheck --workspace @stackpilot/controller`. Its tests use an injected fake platform and must not modify the developer's crontab or execute configured operations.
Agent protocol changes must update `docs/security/controller-agent-threat-model.md`, public contracts, negative tests, and TLS integration tests. Never add a generic shell task or disable certificate verification for local convenience.

## Branches

- Branch from an up-to-date `main`.
- Use a short descriptive prefix such as `feature/`, `fix/`, `docs/`, `test/`, or `security/`.
- Keep one concern per branch. Do not combine formatting, UI redesign, dependency upgrades, and behavior changes without a clear reason.
- Do not commit generated workspace `dist/` directories, test reports, local state, IDE settings, `.env` files, tokens, private keys, or machine-specific data.

## Changes and Commits

- Follow the existing code style and keep unrelated refactors out of the change.
- Add or update automated tests for behavior and security-boundary changes.
- Update documentation when commands, configuration, compatibility, or user-visible behavior changes.
- Write concise commit subjects that describe the result. A formal commit-message convention is not currently required.
- Confirm `git diff --check` and review the staged file list before committing.

## Required Verification

Run the same checks as CI from the repository root:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:deploy
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=high
```

Do not bypass tests, disable lint rules, or suppress high/critical audit findings to make a contribution pass.

## Pull Requests

1. Open a focused pull request against `main` and complete the pull request template.
2. Explain the problem, the chosen approach, risk, and verification evidence.
3. Link related issues where applicable and include screenshots only for visual changes.
4. Ensure every required CI check passes in a clean environment.
5. Respond to review feedback with follow-up commits; avoid unrelated history rewrites after review begins.
6. Wait for maintainer approval before merge. Approval and merge policy are controlled by repository settings.

Submitting a contribution indicates that you have the right to provide it under the repository's [GNU Affero General Public License v3.0 only](LICENSE). No Contributor License Agreement is currently required.
