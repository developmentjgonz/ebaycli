CREATE TABLE auth_states (
  state TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  marketplace_id TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  exchange_code_hash TEXT,
  session_cipher TEXT
);

CREATE INDEX auth_states_expires_at ON auth_states (expires_at);
