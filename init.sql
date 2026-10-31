CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_key VARCHAR(255) UNIQUE NOT NULL,
    embedding vector(384),
    state VARCHAR(50) NOT NULL,
    reputation_score NUMERIC(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS entities_embedding_idx ON entities USING hnsw (embedding vector_cosine_ops);

-- New table for true transactional idempotency
CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(255) PRIMARY KEY,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);