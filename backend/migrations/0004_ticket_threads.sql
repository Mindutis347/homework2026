-- Support conversations. The ticket's own body stays as the opening message, and
-- every reply lives here, so nothing has to be migrated from existing rows.

CREATE TABLE ticket_messages (
    id          BIGSERIAL PRIMARY KEY,
    ticket_id   BIGINT NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
    author_id   BIGINT REFERENCES users (id) ON DELETE SET NULL,
    author_role TEXT NOT NULL CHECK (author_role IN ('customer', 'staff')),
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at);

-- Images are stored in the database on purpose: the API runs on a free tier with
-- an ephemeral disk, and Postgres is the only durable store the app already has.
-- Size and type are enforced by the handler before insert.
CREATE TABLE ticket_attachments (
    id         BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES ticket_messages (id) ON DELETE CASCADE,
    mime       TEXT NOT NULL,
    byte_size  INTEGER NOT NULL,
    data       BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ticket_attachments_message_idx ON ticket_attachments (message_id);
