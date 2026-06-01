import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;

async function main() {
  const sql = postgres(connectionString);

  console.log('Creating chat_sessions table...');
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  console.log('Creating chat_messages table...');
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      sources JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  console.log('Creating indexes...');
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON chat_sessions(updated_at DESC);
  `);

  // Ensure match_documents RPC exists (idempotent).
  console.log('Ensuring match_documents RPC...');
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION match_documents (
      query_embedding VECTOR(1024),
      match_count INT DEFAULT 4
    )
    RETURNS TABLE (
      id UUID,
      source_type TEXT,
      source_name TEXT,
      content TEXT,
      metadata JSONB,
      similarity FLOAT
    )
    LANGUAGE SQL STABLE
    AS $$
      SELECT
        documents.id,
        documents.source_type,
        documents.source_name,
        documents.content,
        documents.metadata,
        1 - (documents.embedding <=> query_embedding) AS similarity
      FROM documents
      ORDER BY documents.embedding <=> query_embedding
      LIMIT match_count;
    $$;
  `);

  console.log('Done!');
  await sql.end();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
