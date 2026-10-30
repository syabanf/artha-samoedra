# Artha Samoedra: asset ERP frontend

Frontend for Artha Samoedra's property asset business: a public listing website with the Jessy chat agent, a partner portal for listing and delisting by chat, and a team console for listings, inquiries, exclusive rights, profit sharing and SEO content. Mock data only, stored in the browser.

## Run

```bash
pnpm install
pnpm dev
```

The website opens at `/`, the partner portal at `/partners` and the console at `/console` (pick a demo user). Use "Reset data demo" in the console user menu to restore the seed.

## Scripts

- `pnpm typecheck`: every package and the app
- `pnpm test`: store and Jessy journey tests
- `pnpm build`: production build

See `docs/frontend-conventions.md` for structure and rules.
