# Crowdsourced Data Reconciliation Engine

An event-ingestion pipeline that merges duplicate company records from noisy crowdsourced submissions ("Apex Corp", "Apex Incorporated", "Apex, Inc.") into one entity, safely under concurrent writes, and streams state changes to a live dashboard.

**Live demo:** [dashboard](https://frontend-lemon-omega-61.vercel.app) · [API](https://data-recon-engine.onrender.com)
*The API runs on a free tier and sleeps when idle. The first request can take about a minute to wake it. Click "Run Demo" on the dashboard and wait for entities to appear.*

<img width="1280" height="684" alt="demo2" src="https://github.com/user-attachments/assets/858a5d13-1ec7-4c62-96fc-84b606f864e5" />





**Stack:** TypeScript · Express · BullMQ/Redis · PostgreSQL + pgvector · `all-MiniLM-L6-v2` (local embeddings via `@xenova/transformers`) · Next.js (SSE dashboard) · k6 · Vitest

```
POST /ingest → BullMQ (Redis) → worker → PostgreSQL + pgvector
                                   └─ publish after COMMIT → Redis pub/sub → GET /stream (SSE) → Next.js dashboard
```

## How it works

1. **Ingest.** `POST /ingest` validates `{ eventId, businessKey, data }` and enqueues a BullMQ job with `jobId = eventId`, 3 attempts and exponential backoff. It returns `202`.
2. **Normalize.** Names are lowercased, punctuation is stripped, and trailing legal suffixes (inc, corp, llc, ltd, gmbh, plc, …) are removed.
3. **Embed.** The worker computes a 384-dim MiniLM embedding *before* opening the transaction, so slow model inference never holds a DB lock or connection.
4. **Resolve (inside one transaction).**
   - Insert `eventId` into `processed_events` (`ON CONFLICT DO NOTHING`). If nothing was inserted, the event was already handled and the job exits.
   - Take a global `pg_advisory_xact_lock(1)`.
   - Look for an exact `business_key` match. If there is none, run a pgvector cosine search (HNSW index) with threshold **0.92**.
   - On a match, apply a reputation update. Otherwise insert a new `NEW` entity.
   - `COMMIT`.
5. **Publish.** After the commit, the worker publishes `{ id, state, reputation }` to Redis. A publish failure is logged and does not fail the job.
6. **State machine.** Each confirming event adds +0.5 reputation (cap 10.0). An entity moves `NEW → VERIFIED` at 5.0.

## Correctness decisions

| Problem | Decision |
|---|---|
| Duplicate delivery of the same event | Two layers. BullMQ `jobId` dedups at enqueue. A transactional `processed_events` insert dedups at processing. The event ID and the state change commit or roll back together, so a failed job is retried rather than lost. |
| Two near-duplicate events create two entities | The check-then-insert on semantic similarity can't be protected by a unique constraint, because the keys differ. A single global advisory lock serializes the resolve step. |
| Lost reputation updates | Same lock. Read-modify-write on `reputation_score` happens only while holding it. |
| Event lost if the worker crashes mid-job | Idempotency is recorded inside the same transaction as the effect. There is no "mark seen" step outside the DB. |
| Dashboard showing uncommitted state | Publish happens after `COMMIT`. |

## Evidence

**Invariant test.** `load-test.js` submits 50 companies × 3 name variants, each sent twice (once normally, once as a redelivery with the same `eventId`), from 20 virtual users for 10 s. `npm run assert` then checks, after the queue drains:

- exactly 50 entities (variants merged)
- exactly 150 processed events (redeliveries absorbed)
- 0 failed jobs
- 0 entities with `reputation_score ≠ 2.0` (each entity gets 2 confirming merges from 3 variants: 1.0 + 0.5 + 0.5)

Passing run (clean state, unique `RUN_ID`, worker concurrency 5): 6,587 iterations, 13,174 requests (0 failed, all `202`), p95 request latency 33.6 ms. `assert`: 50 entities, 150 processed events, 0 failed jobs, 0 bad reputations.

**Mutation test.** To check the test can actually detect a race, I removed the advisory lock and re-ran with concurrent workers. Result: entity count stayed at 50 but **2 entities ended with a wrong reputation, and the assertion failed.** The reputation invariant is what catches lost updates. The entity count alone did not. (With worker concurrency 1 there is no race to detect, so this test only means something at concurrency > 1.)

**Similarity threshold.** 100 labeled pairs (40 should-match, 60 should-not) in `src/pairs.json`; `npm run evaluate` sweeps thresholds. At 0.92: **precision 100%, recall 92.5%** (37 of 40). Lowering to 0.90 drops precision to 92.5%; 0.94 gives the same result as 0.92. *The threshold was chosen and measured on the same 100 pairs, so these figures are optimistic; they are not held-out accuracy.*

**Unit tests.** `npm test` covers the state machine transitions.

## Deployment

| Part | Host |
|---|---|
| Dashboard (Next.js) | Vercel |
| API + worker | Render (one instance runs both processes) |
| PostgreSQL + pgvector, Redis | Managed free-tier services |

Configuration is by environment variable: `DATABASE_URL`, `REDIS_URL`, `PORT`, `WORKER_CONCURRENCY` (default 5), `DB_SSL` (set to `true` for a managed Postgres that requires SSL), and `NEXT_PUBLIC_API_URL` on the frontend. The public API is rate limited (`/ingest`: 500 requests per 15 minutes per IP; `/demo`: 5 per 15 minutes), and the demo endpoint only queues a fixed sample set. The rate limit is skipped when `NODE_ENV=test` so the load test can run.

## Limitations

- **Throughput is bounded by the global lock.** The resolve step is serialized across all workers, which is the price of a simple correctness argument. Sharding the lock (for example by name prefix bucket) would help but would need care for near-duplicates that straddle buckets.
- **The k6 numbers measure API ingest latency, not processing throughput.** The API only enqueues; the load test sends 300 jobs per run (the rest are deduplicated at enqueue).
- **Threshold evaluated on its tuning set** (see above); no held-out set.
- **Recall gap.** About 7% of true duplicates in the labeled set are not merged at 0.92.
- **Not a multi-node design.** One Redis and one Postgres, with the API and worker sharing a single free-tier instance in the demo. It is not a distributed or fault-tolerant deployment.
- **SSE** uses one Redis subscription listener per connected client on a shared connection. Fine for a demo, not tuned for many clients.
- **Reputation** is a simple confirmation counter, not a trust model.

## Run it locally

```bash
docker compose up -d
docker exec -i $(docker compose ps -q db) psql -U user -d recon < init.sql
npm install
NODE_ENV=test npm start   # API on :3000 (NODE_ENV=test enables the jobId override the load test uses)
npm run worker            # in a second terminal
cd frontend && npm install && npm run dev   # dashboard on :3001

# test (clean state each time: flush Redis, TRUNCATE entities, processed_events)
k6 run -e RUN_ID=run1 load-test.js
npm run assert
npm run evaluate          # threshold sweep
npm test                  # state machine
```

## License

MIT. See [LICENSE](LICENSE).
