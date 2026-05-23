# obsidian-link-resolver

A tiny Cloudflare Worker that 302-redirects short HTTP URLs to `obsidian://` deep links. Pair with the [`obsidian-mcp`](https://github.com/dszp/obsidian-mcp-cloudflare) Worker, which mints stable `id:` fields in note frontmatter that this resolver targets.

The resolver is **content-free by design**: no R2 bucket, no KV namespace, no Durable Object, no datastore of any kind. It reads no vault state. It only knows your vault name (one wrangler var) and three URL shapes.

## Routes

| Route | Redirects to | Survives rename? |
|------|---|---|
| `GET /n/<id>` | `obsidian://advanced-uri?vault=<NAME>&uid=<id>` | ✅ Yes — resolves by frontmatter `id`, not by path |
| `GET /p/?path=<urlencoded path>` | `obsidian://open?vault=<NAME>&file=<path>` | ❌ No — full-path lookup |
| `GET /f/<urlencoded name>` | `obsidian://open?vault=<NAME>&file=<name>` | ⚠️ Partial — Obsidian wikilink-style lookup; deterministic if unambiguous |
| `GET /` | 200 plain text | — |
| anything else / bad shape | 400 plain text "invalid" | — |

Only `GET` and `HEAD` are accepted. Anything else → 405.

## Security model

The threat is **not** classic open-redirect. The only redirect target is `obsidian://`, which is constructed from constants. The real threat is **reflected param injection**: tampered URLs in externally-writable systems (ticketing tools, synced to-do items, anywhere a link can be edited by someone other than you) that smuggle extra `&param=` into Advanced URI, which can write notes or run commands when the user later clicks them.

Defenses, layered:

1. **Anchored allowlist regex per route.** `/n/` accepts a 21-char nanoid (URL-safe alphabet) OR a strict UUIDv4 (version nibble = 4, variant nibble in `{8,9,a,b}`) — the two id shapes minted by the MCP and by Obsidian's Advanced URI plugin respectively. UUIDv1/v3/v5, the NIL UUID, and any non-hex content are rejected. `/p/` requires `.md` suffix and a conservative charset, rejects `..`, leading `/`, leading `\`, and any of `& ? # = \r \n`. `/f/` rejects slashes and the same dangerous chars.
2. **`encodeURIComponent` on every variable** before interpolation into the `Location` header. The single most important line in the resolver.
3. **No reflection.** The vault name comes from `env.VAULT_NAME`, never from input. The `Location` is constant scheme + constant query keys + one encoded variable.
4. **Fail closed.** Invalid input → 400 plain text. No fallback redirect, no echo of input, no interstitial HTML.
5. **No caching of variable input** (`Cache-Control: no-store` on every response).
6. **No `Set-Cookie` headers, ever.**

Cloudflare Access is intentionally **not** in front of the redirect routes. The redirects emit only `obsidian://` URIs — they expose no content. Access doesn't address the documented threat (tampered links in external systems: the user would authenticate and the malicious params would still execute on their machine). Friction is real, especially on mobile. Access stays available to bolt onto a future authenticated `/v/<id>` read-view route.

## Quick deploy (third-party / first time)

```bash
git clone https://github.com/dszp/obsidian-link-resolver-cloudflare.git
cd obsidian-link-resolver
npm install

# 1. Auth wrangler to your Cloudflare account.
npx wrangler login
npx wrangler whoami   # note the account id

# 2. Fill in your values.
cp .env.example .env
$EDITOR .env   # set CLOUDFLARE_ACCOUNT_ID, RESOLVER_HOSTNAME, VAULT_NAME

# 3. Generate wrangler.jsonc from the template + .env.
npm run setup

# 4. Test, then deploy.
npm test
npx wrangler deploy
```

The hostname in `RESOLVER_HOSTNAME` must be a DNS name on a zone in the same Cloudflare account. Wrangler provisions the DNS record and custom-domain cert on first deploy.

`VAULT_NAME` is the **Obsidian vault identifier** — exactly the string Obsidian uses to identify the vault, **not** the R2 bucket name and **not** the folder name on disk. Open Obsidian → Settings → Advanced URI → "Vault name parameter" to confirm.

For routine deploys and rollback, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

Smoke-test after first deploy with a real id minted by the MCP:

```
https://<your-RESOLVER_HOSTNAME>/n/<a-real-21-char-nanoid>
```

On desktop and on iPhone, this should open Obsidian and navigate to the matching note.

## Open verification items (do once after deploy)

- **Advanced URI behavior on unknown `uid=`:** does Obsidian show a graceful "note not found" or silently no-op? Click `/n/aaaaaaaaaaaaaaaaaaaaa` (21 a's) to test.
- **`obsidian://open?file=<bare-name>` resolution order:** if two notes share a basename in different folders, which one does Obsidian pick? Create two test notes named `Foo.md` and click `/f/Foo` to observe.
- **Advanced URI parameter surface check:** if the plugin gains new dangerous params in a future version, the input-shape allowlists here neutralize them automatically. But re-check this assumption on each AU upgrade.

## Local dev

```bash
npm run dev
# in another terminal:
curl -i 'http://localhost:8787/n/ABCdefGHIjkl_MNO-1234'
# → 302 obsidian://advanced-uri?vault=<your-vault>&uid=ABCdefGHIjkl_MNO-1234
```

## Tests

```bash
npm test
```

37 tests cover every happy path, every fail-closed case (invalid lengths, embedded ampersands, path traversal, leading slashes, bad extensions, control characters, embedded slashes in `/f/<name>`), the method allowlist, and the absence of cookies.

Tests use a fixture `VAULT_NAME` (set in `vitest.config.ts`), so they don't depend on your production `.env` values.

## Configuration files

| File | Committed? | Purpose |
|---|---|---|
| `.env.example` | ✅ | Documents required env vars. |
| `.env` | ❌ (gitignored) | Your filled-in values. Read by `npm run setup`. |
| `wrangler.example.jsonc` | ✅ | Template with `${PLACEHOLDER}` tokens. |
| `wrangler.jsonc` | ❌ (gitignored) | Generated by `npm run setup` from the template + `.env`. Wrangler reads this. |
| `scripts/setup.mjs` | ✅ | Substitutes `.env` values into the wrangler template. |

Re-running `npm run setup` is safe — it overwrites `wrangler.jsonc` from the current `.env`.

## Why this is a separate Worker from `obsidian-mcp`

The MCP Worker has `r2_buckets`, `kv_namespaces`, and a `durable_objects` class — it reads and writes the vault. The resolver has none of those bindings and never will. Co-locating them would put a content-free public endpoint inside a Worker with full vault access — a wider blast radius for no operational gain. Different deploy cadence, different auth model (this Worker has none; the MCP has OAuth), different domain.

## License

MIT — see [LICENSE](./LICENSE).

## Author

[David Szpunar](https://david.szpunar.com)
