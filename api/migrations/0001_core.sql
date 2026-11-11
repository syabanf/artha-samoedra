-- Every collection the frontend keeps (listings, journals, employees...) lives here as camelCase
-- JSON documents. seq keeps the seed order; version guards optimistic concurrency.
CREATE TABLE records (
    collection text        NOT NULL,
    id         text        NOT NULL,
    data       jsonb       NOT NULL,
    version    integer     NOT NULL DEFAULT 1,
    seq        bigserial   NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection, id)
);
CREATE INDEX records_data_gin ON records USING gin (data);
CREATE INDEX records_collection_seq ON records (collection, seq);
-- Two writers must not hand out the same listing or inquiry code.
CREATE UNIQUE INDEX records_code ON records (collection, (data ->> 'code'))
    WHERE collection IN ('listings', 'inquiries');

-- Settings objects that exist once: company, financeSettings, aiSettings...
CREATE TABLE singletons (
    name       text PRIMARY KEY,
    data       jsonb       NOT NULL,
    version    integer     NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Password hashes stay out of records so no query can list them.
CREATE TABLE credentials (
    user_id       text PRIMARY KEY,
    password_hash text        NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Transactional outbox: domain events written in the same transaction as the change.
CREATE TABLE events (
    id           bigserial PRIMARY KEY,
    name         text        NOT NULL,
    aggregate_id text        NOT NULL,
    payload      jsonb       NOT NULL,
    actor_id     text        NOT NULL,
    occurred_at  timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX events_unpublished ON events (id) WHERE published_at IS NULL;

-- One row per command, whether it succeeded or was refused.
CREATE TABLE audit_log (
    id       bigserial PRIMARY KEY,
    at       timestamptz NOT NULL,
    actor_id text        NOT NULL,
    command  text        NOT NULL,
    payload  jsonb       NOT NULL,
    outcome  text        NOT NULL,
    detail   text        NOT NULL DEFAULT ''
);
CREATE INDEX audit_log_at ON audit_log (at DESC);
