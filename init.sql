CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_key VARCHAR(255) NOT NULL,
    embedding vector(384),
    state VARCHAR(50) NOT NULL,
    reputation_score NUMERIC(5,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(business_key)
);

CREATE INDEX ON entities USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);