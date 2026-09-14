# RealPotential Visuals — realpotentialvisuals.com

Next.js site for the RealPotential Visuals marketing/order site, deployed to
Cloudflare Workers via the OpenNext adapter. See the project briefing docs one
level up (`../realpotential-*.html`, `../Claude Code/pipeline/`) for the full
business/product/schema context.

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind CSS v4)
- **Cloudflare Workers** as the runtime, via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- **GitHub** as interim storage — Cloudflare Workers Builds (or Pages) connects to this repo for auto-deploy on push
- **D1 / R2 / KV** — storage bindings are scaffolded but commented out in
  `wrangler.jsonc`. Connect them once real resources exist (see below).

## First-time setup (once Node.js is installed)

```bash
npm install
npm run dev
```

## Connecting D1 / R2 / KV

1. Create the resources:
   ```bash
   npx wrangler d1 create realpotential
   npx wrangler r2 bucket create realpotential-media
   npx wrangler kv namespace create SESSIONS
   ```
2. Uncomment the matching blocks in `wrangler.jsonc` and paste in the real
   `database_id` / KV `id` values wrangler prints out.
3. Regenerate binding types:
   ```bash
   npm run cf-typegen
   ```
4. Access bindings in server code via `getCloudflareContext().env` (from
   `@opennextjs/cloudflare`).

The canonical D1 schema is `../realpotential-schema.sql` (see also
`../realpotential-schema-patch-001.sql`). Apply it to a new D1 database with:

```bash
npx wrangler d1 execute realpotential --file=../realpotential-schema.sql
```

## Deploying

```bash
npm run deploy
```

Or connect this GitHub repo to Cloudflare Workers Builds for deploy-on-push,
per Section 7 of the project briefing (GitHub = interim file holder, Cloudflare
watches the repo).

## Status

Scaffold only — see the project briefing for the full page structure
(Section 12) still to be ported over from the earlier static `index.html`
prototype, and Section 9 for the Python/SQLite reference pipeline this app
will eventually replace in production.
