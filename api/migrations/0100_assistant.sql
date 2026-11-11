-- Jessy, the console assistant: a conversation per member and the commands it proposed.
-- Turns are a JSON array because they are always read and written whole.
CREATE TABLE assistant_conversations (
    id         text PRIMARY KEY,
    owner_id   text        NOT NULL,
    turns      jsonb       NOT NULL DEFAULT '[]',
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX assistant_conversations_owner ON assistant_conversations (owner_id, updated_at DESC);

-- A proposal runs only when its owner confirms it before expires_at. It has no foreign key
-- because the turn stores its proposals before it saves a new conversation.
CREATE TABLE assistant_proposals (
    id              text PRIMARY KEY,
    conversation_id text        NOT NULL,
    owner_id        text        NOT NULL,
    command         text        NOT NULL,
    args            jsonb       NOT NULL,
    summary         text        NOT NULL,
    status          text        NOT NULL,
    error           text        NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL,
    expires_at      timestamptz NOT NULL,
    decided_at      timestamptz
);
CREATE INDEX assistant_proposals_conversation ON assistant_proposals (conversation_id);
