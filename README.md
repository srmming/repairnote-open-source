# RepairNOTE

RepairNOTE is a repair shop management system for creating repair tickets, managing clients, catalog data, technicians, reports, customer-facing status pages, and database backups.

The current codebase is a Next.js + MySQL/MariaDB application. It is intended for small repair shops that need a practical internal tool rather than a marketing site.

## Features

- Repair ticket creation and editing
- Client management and client history lookup
- Brand, model, service, part, attribute, and technician management
- Staff login and page permissions
- Multiple portals (shops) in one deployment: clients, orders, catalog, settings and backups are isolated per portal; one account can join several portals; a system administrator manages portals and members from Settings → Portal management (see `docs/门户管理使用说明.md`)
- Reports and finance summaries
- Public repair status page with QR code support
- JSON and ZIP backup export/import
- Safety validation before import, restore, and full data replacement
- Docker and Plesk-oriented deployment helpers

## Tech Stack

- Next.js 16 with App Router
- React 19
- Prisma
- MySQL or MariaDB
- Radix Dialog
- lucide-react
- Plain CSS with shadcn/ui-inspired design tokens

## Requirements

- Node.js 24, see `.node-version`
- npm
- MySQL or MariaDB

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start the local MySQL/MariaDB service:

```bash
docker compose up -d
```

Set real first-admin credentials in `.env` (`REPAIRNOTE_ADMIN_USERNAME` / `REPAIRNOTE_ADMIN_PASSWORD`; default or placeholder passwords are rejected) and `REPAIRNOTE_PUBLIC_ORIGIN` (the origin you open in the browser, e.g. `http://localhost:3000`), then run the database setup (preflight → migrations → first system administrator → health check):

```bash
npm run db:setup
```

Optional demo data for local development only: set `REPAIRNOTE_SEED_DEMO=true` before `npm run db:seed`.

Start the app:

```bash
npm run dev
```

Open the local app at:

```text
http://localhost:3000
```

## Useful Commands

```bash
npm run build
npm run lint                 # real static check (tsc + API auth-guard check), not `next build`
npm run smoke                # SMOKE_USERNAME / SMOKE_PASSWORD required
npm run smoke:mobile
npm run db:setup             # preflight + migrate deploy + seed + system admin bootstrap + check
npm run verify:portals       # multi-portal API acceptance on a *_test database
npm run smoke:portals        # browser walk-through of Settings → Portal management
npm run plesk:pack
```

Upgrading an existing single-portal database requires `REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID`; see `docs/多门户升级与运维说明.md`. Never run old single-portal code against the upgraded database.

## Deployment Notes

Example environment files are provided for local, VPS, and Plesk-style installs:

- `.env.example`
- `.env.vps.example`
- `.env.plesk.example`

There is no default admin password: the first install fails unless real credentials are provided. `REPAIRNOTE_PUBLIC_ORIGIN` must match the public https origin in production.

## Data Safety

RepairNOTE stores business data in MySQL/MariaDB. Backup import, restore, and full database replacement routes validate the payload before writing data.

Do not commit real `.env` files, database dumps, customer backups, screenshots with private data, or generated deployment ZIP files.

## Open Source Status

This repository is being prepared for a clean open-source release. The existing private project history may contain internal development artifacts, so a public release should use a sanitized repository or a cleaned history.

## License

MIT
