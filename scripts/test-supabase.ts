import 'dotenv/config';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL!;

let passed = 0;
let failed = 0;

async function testConnection() {
  console.log('\n--- Test A: Connection ---');
  try {
    const client = postgres(connectionString);
    const result = await client`SELECT 1 as test`;
    if (result[0]?.test === 1) {
      console.log('PASS: Database connected');
      passed++;
    } else {
      console.log(`FAIL: Unexpected result: ${JSON.stringify(result)}`);
      failed++;
    }
    await client.end();
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testEnablePgvector() {
  console.log('\n--- Test B: Enable pgvector extension ---');
  try {
    const client = postgres(connectionString);
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
    const result = await client`SELECT extname FROM pg_extension WHERE extname = 'vector'`;
    if (result.length > 0) {
      console.log('PASS: pgvector extension enabled');
      passed++;
    } else {
      console.log('FAIL: pgvector extension not found');
      failed++;
    }
    await client.end();
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testCreateTable() {
  console.log('\n--- Test C: Create documents table ---');
  try {
    const client = postgres(connectionString);
    await client`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_type TEXT NOT NULL CHECK (source_type = 'url'),
        source_name TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding VECTOR(1024) NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;
    const result = await client`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'documents' AND table_schema = 'public'
    `;
    if (result.length > 0) {
      console.log('PASS: documents table created');
      passed++;
    } else {
      console.log('FAIL: documents table not found');
      failed++;
    }
    await client.end();
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testCreateIndex() {
  console.log('\n--- Test D: Create HNSW index ---');
  try {
    const client = postgres(connectionString);
    await client`
      CREATE INDEX IF NOT EXISTS documents_embedding_idx
      ON documents
      USING hnsw (embedding vector_cosine_ops)
    `;
    const result = await client`
      SELECT indexname FROM pg_indexes WHERE indexname = 'documents_embedding_idx'
    `;
    if (result.length > 0) {
      console.log('PASS: HNSW cosine index created');
      passed++;
    } else {
      console.log('FAIL: Index not found');
      failed++;
    }
    await client.end();
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testCreateRPC() {
  console.log('\n--- Test E: Create match_documents RPC ---');
  try {
    const client = postgres(connectionString);
    await client.unsafe(`
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
    console.log('PASS: match_documents RPC created');
    passed++;
    await client.end();
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function testVectorInsert() {
  console.log('\n--- Test F: Vector insert + search ---');
  try {
    const client = postgres(connectionString);

    // Create a fake 1024-dim embedding
    const fakeEmbedding = `[${Array(1024).fill(0).map(() => (Math.random() * 2 - 1).toFixed(6)).join(',')}]`;

    await client`
      INSERT INTO documents (source_type, source_name, content, embedding, metadata)
      VALUES (
        'url',
        'https://example.com/test',
        'This is a test document for RAG pipeline.',
        ${fakeEmbedding}::vector,
        '{"test": true}'::jsonb
      )
    `;
    console.log('  Insert: OK');

    // Search using RPC
    const queryEmbedding = `[${Array(1024).fill(0).map(() => (Math.random() * 2 - 1).toFixed(6)).join(',')}]`;
    const results = await client`
      SELECT * FROM match_documents(${queryEmbedding}::vector, 4)
    `;

    if (results.length > 0) {
      console.log(`PASS: Vector search returned ${results.length} result(s)`);
      console.log(`  Similarity: ${results[0].similarity}`);
      passed++;
    } else {
      console.log('FAIL: No results from vector search');
      failed++;
    }

    // Cleanup
    await client`DELETE FROM documents WHERE source_name = 'https://example.com/test'`;
    await client.end();
  } catch (err: any) {
    console.log(`FAIL: ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('=== Supabase pgvector Backend Test ===');
  console.log(`Database: ${connectionString.replace(/:[^@]+@/, ':***@')}`);

  await testConnection();
  await testEnablePgvector();
  await testCreateTable();
  await testCreateIndex();
  await testCreateRPC();
  await testVectorInsert();

  console.log('\n=== Hasil ===');
  console.log(`PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    console.log('Ada test yang gagal.');
    process.exit(1);
  } else {
    console.log('Semua test PASS! Supabase pgvector siap integrasi.');
  }
}

main();
