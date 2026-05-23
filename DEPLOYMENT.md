# Deployment

Two scenarios:

1. **[First-time deployment](#first-time-deployment)** — you're deploying this to your own Cloudflare account.
2. **[Routine deploys](#routine-deploys)** — you have an existing deploy and want to push a change.

---

## First-time deployment

### Prerequisites

- A Cloudflare account.
- A domain on Cloudflare DNS in that account (or use a `*.workers.dev` subdomain — see [Alternative: workers.dev subdomain](#alternative-workersdev-subdomain) below).
- Node.js 22+ and npm.
- An existing Obsidian vault on at least one device. (The resolver doesn't read or store any vault content, but it does need to know the vault name to construct `obsidian://` URLs.)

### 1. Clone and install

```bash
git clone https://github.com/dszp/obsidian-link-resolver-cloudflare.git
cd obsidian-link-resolver
npm install
```

### 2. Authenticate wrangler

```bash
npx wrangler login
npx wrangler whoami
```

Note the account id printed by `whoami` — you'll paste it into `.env` next.

### 3. Configure

```bash
cp .env.example .env
$EDITOR .env
```

Fill in:

- **`CLOUDFLARE_ACCOUNT_ID`** — from `npx wrangler whoami`.
- **`RESOLVER_HOSTNAME`** — the hostname this Worker should serve from. Must be a DNS name on a zone in the same Cloudflare account, e.g. `o.example.com`. The DNS record and a custom-domain TLS cert are auto-provisioned by wrangler on first deploy.
- **`VAULT_NAME`** — your Obsidian vault name, exactly as Obsidian uses it. Open Obsidian → Settings → community plugins → Advanced URI → "Vault name parameter" to confirm. This is **not** the R2 bucket name and **not** the folder name on disk.

### 4. Generate wrangler.jsonc

```bash
npm run setup
```

This reads `.env`, substitutes the `${...}` placeholders in `wrangler.example.jsonc`, and writes `wrangler.jsonc`. Idempotent — safe to re-run any time `.env` changes.

### 5. Verify

```bash
npm test
```

Expect: `Tests  37 passed (37)`.

```bash
npx wrangler deploy --dry-run
```

Confirm the bindings shown match your `.env`:

- `env.VAULT_NAME` shows your vault name.
- One route, pointing at your `RESOLVER_HOSTNAME`.

### 6. Deploy

```bash
npx wrangler deploy
```

Or in one shot (re-runs setup first):

```bash
npm run deploy:fresh
```

Wrangler will:

- Upload the Worker bundle.
- Create the DNS record for `RESOLVER_HOSTNAME` (if not already present).
- Provision the custom-domain certificate (typically ready within a minute).

### 7. Smoke test

DNS may take a few seconds to propagate.

```bash
dig <RESOLVER_HOSTNAME> +short
```

Should return Cloudflare anycast IPs (typically `104.21.*` and `172.67.*`).

```bash
curl -i "https://<RESOLVER_HOSTNAME>/"
# Expect: 200, body "obsidian-link-resolver", no Set-Cookie header.

curl -i "https://<RESOLVER_HOSTNAME>/n/aaaaaaaaaaaaaaaaaaaaa"
# Expect: 302, Location: obsidian://advanced-uri?vault=<your-vault>&uid=aaaaaaaaaaaaaaaaaaaaa

curl -i "https://<RESOLVER_HOSTNAME>/n/bad"
# Expect: 400, body "invalid".

curl -i -X POST "https://<RESOLVER_HOSTNAME>/n/aaaaaaaaaaaaaaaaaaaaa"
# Expect: 405, Allow: GET, HEAD
```

End-to-end with Obsidian: open one of the `/n/<id>` URLs in a browser on a device that has Obsidian installed and the vault available. The browser should hand off to Obsidian and open the matching note.

### Alternative: workers.dev subdomain

If you don't have a custom domain, remove the `routes` block from `wrangler.example.jsonc` before running `npm run setup`. Your Worker will be reachable at `https://obsidian-link-resolver.<your-subdomain>.workers.dev`.

---

## Routine deploys

For an already-deployed Worker, when you've made a code change:

```bash
npm test
npx wrangler deploy
```

Wrangler prints a Version ID with each deploy:

```
Current Version ID: <uuid>
```

Save it — it's how you reference this build for rollbacks.

### Rolling back

```bash
npx wrangler rollback <version-id>
```

Or interactively from the Cloudflare dashboard:

```
Workers & Pages → obsidian-link-resolver → Deployments
```

Rolling back is near-instant; the previous bundle is already cached.

---

## Configuration changes

If you change `RESOLVER_HOSTNAME` or `VAULT_NAME`:

```bash
$EDITOR .env
npm run setup       # regenerates wrangler.jsonc
npx wrangler deploy
```

Hostname change: wrangler removes the old custom-domain binding and creates a new one. Allow a few seconds for DNS to settle.

Vault name change: takes effect on next deploy. Any existing redirect URLs already issued by the resolver are stateless 302s — old ones simply stop matching the new vault name on the next click. No data to migrate.

---

## Troubleshooting

### `Hostname '<host>' already has externally managed DNS records`

You have a DNS record (probably an `A` or `CNAME`) already pointing at this hostname. Delete it from the Cloudflare dashboard (DNS for the zone → find the row → delete) and rerun `npx wrangler deploy`. Wrangler will then create the record itself.

### `DNS does not resolve` immediately after first deploy

Wait 30–60 seconds, then retry. If still empty after that, your machine may use a custom DNS proxy (NextDNS, Cloudflare WARP, AdGuard, etc.) — restart that proxy. As a last resort, temporarily point your DNS at `1.1.1.1`.

### Tests fail with `vitest-pool-workers` errors

The vitest-pool-workers package can have module-resolution issues on project paths that contain spaces or special characters. Move the project to a path with only `[A-Za-z0-9_-]` characters and retry.
