# RepairNOTE

RepairNOTE is a repair shop management system for creating repair tickets, managing clients, catalog data, technicians, reports, customer-facing status pages, and database backups.

The current codebase is a Next.js + MySQL/MariaDB application. It is intended for small repair shops that need a practical internal tool rather than a marketing site.

## Features

- Repair ticket creation and editing
- Client management and client history lookup
- Brand, model, service, part, attribute, and technician management
- Staff login and page permissions
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

Run migrations and seed data:

```bash
npm run db:migrate
npm run db:seed
```

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
npm run smoke
npm run smoke:mobile
npm run db:migrate:deploy
npm run db:seed
npm run plesk:pack
```

## Deployment Notes

Example environment files are provided for local, VPS, and Plesk-style installs:

- `.env.example`
- `.env.vps.example`
- `.env.plesk.example`

Change the default admin password before exposing the app to the public internet.

## Data Safety

RepairNOTE stores business data in MySQL/MariaDB. Backup import, restore, and full database replacement routes validate the payload before writing data.

Do not commit real `.env` files, database dumps, customer backups, screenshots with private data, or generated deployment ZIP files.

## Open Source Status

This repository is being prepared for a clean open-source release. The existing private project history may contain internal development artifacts, so a public release should use a sanitized repository or a cleaned history.

## License

MIT
