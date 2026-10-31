# Crowdsourced Data Reconciliation Engine

A real-time consensus engine that ingests crowdsourced data streams, resolves entities using vector similarity, and prevents duplicate records under high concurrency.

![Demo GIF](placeholder.gif)

## Architecture
`ingest → Redis → worker → Postgres/pgvector → SSE → dashboard`

## Data Model
**entities**
- `id`: UUID (Primary Key)
- `business_key`: VARCHAR(255) (Unique Constraint)
- `embedding`: vector(384) (HNSW Indexed)
- `state`: VARCHAR(50)
- `reputation_score`: NUMERIC(5,2)
- `created_at`: TIMESTAMP

## Key Decisions
- **Idempotency**: Layer 1 uses Redis `SET NX` with a 24-hour TTL for the fast path. Layer 2 relies on a Postgres unique constraint as the final guard.
- **Locking**: Uses per-bucket Postgres advisory locks (`pg_try_advisory_xact_lock`) to prevent the deduplication race condition where two concurrent near-duplicate events bypass the `SELECT` check and create dual entities.
- **Threshold**: Cosine similarity threshold set to 0.90 based on an evaluation of 200 labeled pairs.

## State Machine & Reputation
Transition from `NEW` to `VERIFIED` based on a weighted-reputation state machine. 
Formula: `reputation_score = min(reputation_score + 0.5, 10.0)`
State transition triggers at `reputation_score >= 5.0`.

## Quick Start
```bash
docker compose up -d
docker exec -i $(docker compose ps -q db) psql -U user -d recon < init.sql
npm start
npm run worker
k6 run load-test.js