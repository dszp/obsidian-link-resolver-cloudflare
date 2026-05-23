# Changelog

All notable changes to this project will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation

- README now links to the [announcement blog post](https://dszp.dev/2026/05/23/two-workers-for-obsidian-and-claude-ai/) covering the motivation and design of both Workers.
- DEPLOYMENT.md gained a "Branching and release workflow" section documenting dev-branch discipline and the release-cut runbook.

## [0.2.0]

### Added

- `${PLACEHOLDER}`-driven configuration. `wrangler.example.jsonc` + `.env.example` are the committed templates; `wrangler.jsonc` and `.env` are generated locally by `npm run setup` and gitignored. Lets the same codebase deploy to anyone's Cloudflare account with no hand-edits to wrangler config.
- `scripts/setup.mjs` — zero-dependency Node script that reads `.env`, substitutes placeholders, and writes `wrangler.jsonc`.
- `npm run setup` and `npm run deploy:fresh` package scripts.
- `DEPLOYMENT.md` covering first-time third-party deploys, routine deploys, and rollback.

### Changed

- README rewritten for public consumption: no per-instance hostnames or account ids baked into prose, "Quick deploy" section added up front.
- Tests now read `VAULT_NAME` from the `env` binding (a fixture set in `vitest.config.ts`) instead of duplicating the production value as a constant. Test suite stays decoupled from deploy config.

## [0.1.0]

### Added

- Initial Worker with three routes: `/n/<id>` (nanoid or UUIDv4 → Advanced URI), `/p/?path=<path>` (full path → `obsidian://open`), `/f/<name>` (bare name → `obsidian://open`).
- Anchored allowlist regexes per route to defend against `&param=` injection through Advanced URI.
- `encodeURIComponent` on every interpolated variable.
- Fail-closed 400 on any invalid input. No reflection of input in responses.
- `Cache-Control: no-store` on every response. No `Set-Cookie` ever.
- 37-test vitest suite covering happy paths and every fail-closed case.

[Unreleased]: https://github.com/dszp/obsidian-link-resolver-cloudflare/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/dszp/obsidian-link-resolver-cloudflare/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dszp/obsidian-link-resolver-cloudflare/releases/tag/v0.1.0
