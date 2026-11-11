# Artha Samoedra API

The Go backend for the Artha Samoedra property ERP. It stores the same records the frontend demo
uses (`seed/seed.json`, exported from `packages/fixtures`), runs listing and inquiry commands with
the frontend's rules, and serves every collection to signed-in users by permission. The frontend
does not call it yet.

## Run it

```sh
cp .env.example .env      # then set JWT_SECRET
make up                   # Postgres 17 on host port 5433
make seed                 # migrations + demo data (skips if data exists)
make run                  # http://localhost:8080
```

Every seeded user signs in with `DEMO_PASSWORD` (default `artha-demo`), for example
`ayu@arthasamoedra.id` (admin) or `dimas@arthasamoedra.id` (sales).

| Target | What it does |
| --- | --- |
| `make up` / `make down` | Start or stop Postgres. Set `POSTGRES_PORT` if 5433 is taken, and match `DATABASE_URL`. |
| `make seed` | Apply migrations and load the seed into an empty database. |
| `make reseed` | Truncate the tables and load the seed again (`go run ./cmd/seed --reset`). |
| `make run` | Serve the API. |
| `make test` | Unit tests, plus the integration tests when `DATABASE_URL` is set. |
| `make test-unit` | Unit tests only. |
| `make lint` | gofmt check and `go vet`. |

The integration tests in `internal/app` reload the seed, so point `DATABASE_URL` at a database you
can wipe.

## Layers

```
cmd/api, cmd/seed          composition: config, pool, migrations, buses, server
internal/app               the wiring both commands and the integration tests share
internal/interfaces/httpapi HTTP: decode, dispatch, encode; auth, request id, recovery, access log, CORS
internal/infrastructure    postgres (repositories, read model, outbox, audit, migrations, seed), security (JWT, bcrypt)
internal/application       cqrs (buses, middleware), listings, inquiries, records (queries), auth
internal/domain            aggregates and rules: listing, inquiry, sharing, exclusive, portal, iam, shared
migrations                 embedded SQL, applied in file-name order
```

Imports point inward only. The domain uses the standard library and nothing else. The application
layer imports the domain and declares the ports it needs (repositories, `TxManager`, `AuditLog`,
`Outbox`, `Reader`, `Directory`). Infrastructure and interfaces implement or call those ports.
Business rules live in the domain; HTTP handlers and SQL hold none.

Aggregates carry no JSON tags. The postgres repositories map them to the camelCase documents of
`packages/types/src` and save with `data || patch`, so fields the domain does not model survive
a write. Each save checks the `version` column and returns 409 when someone saved first.

## Storage

| Table | Holds |
| --- | --- |
| `records` | Every collection as JSON documents: `(collection, id)` key, `data jsonb`, `version`, `seq` for seed order, GIN index on `data`. |
| `singletons` | The nine settings objects (`company`, `financeSettings`, ...). |
| `credentials` | bcrypt password hashes. No query reads this table. |
| `events` | Transactional outbox: domain events written in the command's transaction. |
| `audit_log` | One row per command with the actor, payload and outcome. |
| `schema_migrations` | Applied migration file names. |

## CQRS flow

A command goes through the command bus:

1. **Authorize** refuses with 401 when the command needs a permission and nobody signed in, and
   with 403 when the actor's role lacks it.
2. **Transactional** opens a pgx transaction and puts it in the context; every repository uses it.
3. **Audit** writes one `audit_log` row after the handler. A refused command's row goes through the
   pool, so the rollback keeps it.
4. **Events** gives the handler a recorder. After the handler it runs the subscribers for each
   recorded event in the same transaction (events they raise run too), then appends all of them
   to the `events` outbox.
5. The **handler** loads an aggregate, calls a domain method, saves it and records its events.

Queries go through a second bus with Authorize only. Records queries ask for the permission of the
collection they read (`listings` needs `listing.view`, `journals` needs `finance.view`); the map
in `internal/application/records/permissions.go` covers all 101 seeded collections. An unknown
collection is 404.

Sign-in sits beside the buses: `POST /auth/login` checks the bcrypt hash and returns an HS256 JWT.
On each request the auth middleware verifies the token and loads the user and their role's
permissions into an `iam.Actor`. No token means the anonymous actor; a bad token is 401.

### Commands

| Name | Permission | Body |
| --- | --- | --- |
| `listings.create` | `listing.edit` | title, type, deal, partnerId, city, district, address, price, landArea, buildingArea, bedrooms, certificate, description, highlights |
| `listings.update` | `listing.edit` | id plus the fields that change |
| `listings.approve` | `listing.approve` | id |
| `listings.markSold` | `listing.sell` | id, soldPrice |
| `listings.delist` | `listing.sell` | id, reason |
| `inquiries.submit` | public | name, phone, listingId, message, budget |
| `inquiries.assign` | `inquiry.manage` | id, ownerId |
| `inquiries.setStatus` | `inquiry.manage` | id, status |

Subscribers:

- `listing.approved` adds the default profit-share scheme (2.5% commission, company 70, agent 30)
  when the listing has none.
- `listing.closed` (sold or delisted) ends the running exclusive rights and marks the listing's
  portal copies `removed`.

### Queries

| Name | Permission | Body |
| --- | --- | --- |
| `records.list` | per collection | collection, q, where (field equality on top-level fields, `"null"` matches null), sort (`field` or `-field`, default seed order), limit (default 50, max 200), offset. Returns `{items, total}`. |
| `records.get` | per collection | collection, id |
| `settings.get` | per settings object | name |
| `listings.stats` | `listing.view` | none. Returns `{total, byStatus}`. |
| `listings.public` | public | q, limit, offset. Live listings with public fields only. |

## Endpoints

All under `/api/v1` except `/healthz`. Errors look like `{"error":{"code","message"}}`: rule 422,
not found 404, unauthenticated 401, forbidden 403, conflict 409.

| Method and path | Does |
| --- | --- |
| `GET /healthz` | Liveness. |
| `POST /auth/login` | `{email, password}` returns `{token, expiresAt, user}`. |
| `GET /me` | The user, role and permissions. |
| `GET /commands` | Commands the caller may run. |
| `POST /commands/{name}` | Runs a command; the JSON body is the command. |
| `GET /queries` | Queries the caller may run. |
| `POST /queries/{name}` | Runs a query. |
| `GET /records/{collection}` | `records.list`; `q`, `sort`, `limit`, `offset` map across and any other parameter filters, e.g. `?status=active&sort=-price`. |
| `GET /records/{collection}/{id}` | `records.get`. |
| `GET /settings/{name}` | `settings.get`. |
| `GET /public/listings` | `listings.public`, no token needed. |

`Server.Mount(pattern, handler)` serves another handler behind the auth middleware.

## Deploy

`docker build -t artha-api .` from this folder builds the API and the seed loader. The image
carries `.env.production` (Jessy's provider and model). Secrets never enter git, so the server
sets three variables:

```sh
docker run -d -p 8080:8080 -e DATABASE_URL=postgres://... -e JWT_SECRET=<long random> \
  -e DEEPSEEK_API_KEY=sk-... artha-api
docker run --rm -e DATABASE_URL=postgres://... artha-api /app/seed --reset   # demo data, once
```

Settings load in this order, first one wins: the server's environment, `.env` (local, git-ignored),
then `.env.production`.

## Jessy, the AI assistant

Jessy answers members' questions from live data and proposes changes they confirm. The model sits
behind the `LLM` port in `internal/application/assistant`, with one adapter per provider in
`internal/infrastructure/llm`. `LLM_PROVIDER` picks one: `deepseek` (the default) or `ollama`.

Set these in `.env` (never commit a key; the repository is public):

| Variable | Default | |
| --- | --- | --- |
| `LLM_PROVIDER` | `deepseek` | `deepseek` or `ollama`. |
| `DEEPSEEK_API_KEY` | none | DeepSeek key. Without it the assistant answers 502. |
| `DEEPSEEK_MODEL` | `deepseek-chat` | Any DeepSeek model with tool calling. |
| `DEEPSEEK_HOST`, `DEEPSEEK_TIMEOUT` | `https://api.deepseek.com`, `90s` | |
| `OLLAMA_API_KEY` | none | Ollama Cloud key, when `LLM_PROVIDER=ollama`. |
| `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT` | `https://ollama.com`, `gpt-oss:120b`, `90s` | Or a local Ollama at `http://localhost:11434`. |

How a turn works:
- Read tools (`search_records`, `get_record`, `get_settings`, `listing_stats`, `attendance_today`,
  `low_stock`, `overdue_invoices`) run on the query bus as the member, so their permissions apply.
- A filter that matches nothing returns the values that exist, and Jessy searches again.
- `propose_command` checks the command and its argument fields against the command bus catalog and
  stores a proposal. Nothing changes until the member confirms it, and the command then runs as that
  member through the full command pipeline (transaction, audit log, events). Proposals expire after
  15 minutes and only their owner may confirm them.

| Endpoint (under `/api/v1/assistant`) | |
| --- | --- |
| `POST /messages` | `{conversationId?, text}`; returns the reply, proposals, tool calls with their arguments, and token usage. |
| `POST /proposals/{id}/confirm` | Runs the proposed command as the member. |
| `POST /proposals/{id}/cancel` | Discards the proposal. |
| `GET /conversations/{id}` | The member's own conversation. |

The Ollama live test calls the provider: `set -a; . ./.env; set +a; go test -tags live ./internal/infrastructure/llm/ollama/`.

```sh
TOKEN=$(curl -s -X POST localhost:8080/api/v1/auth/login \
  -d '{"email":"ayu@arthasamoedra.id","password":"artha-demo"}' | jq -r .token)
curl -s "localhost:8080/api/v1/records/listings?status=review" -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:8080/api/v1/commands/listings.approve \
  -H "Authorization: Bearer $TOKEN" -d '{"id":"lst-13"}'
```
