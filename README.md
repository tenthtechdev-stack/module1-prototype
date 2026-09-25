# Stock Supplies

## Module 01 Prototype

High-fidelity frontend prototype for **Marketplace Profitability & Analytics**.

### Quick start

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Prototype mode is controlled at build time:

```dotenv
NEXT_PUBLIC_PROTOTYPE_MODE=true
```

Production check:

```bash
npm run check
npm run build
```

See [docs/PROTOTYPE_HANDOFF.md](docs/PROTOTYPE_HANDOFF.md) for the domain model, route map, Prototype Controller, mock limitations, deployment notes, and API handoff boundary.
