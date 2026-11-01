import { Worker } from 'bullmq';
import { Pool } from 'pg';
import { pipeline } from '@xenova/transformers';
import { createClient } from 'redis';
import { THRESHOLD } from './config.js';
import { normalizeName } from './normalize.js';
import { computeNextState } from './stateMachine.js';

const pool = new Pool({ user: 'user', host: 'localhost', database: 'recon', password: 'password', port: 5432 });
const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

const worker = new Worker('ingest', async job => {
  const { eventId, businessKey, data } = job.data;
  
  const isDuplicate = await redis.set(`evt:${eventId}`, '1', { NX: true, EX: 86400 });
  if (!isDuplicate) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Postgres layer 2 idempotency check
    const checkRes = await client.query('SELECT 1 FROM processed_events WHERE event_id = $1', [eventId]);
    if (checkRes.rowCount && checkRes.rowCount > 0) {
      await client.query('ROLLBACK');
      return;
    }

    const normalizedName = normalizeName(data?.name ?? businessKey);
    const emb = Array.from((await embedder(normalizedName, { pooling: 'mean', normalize: true })).data);
    const embString = `[${emb.join(',')}]`;

    // Advisory lock to prevent deduplication race conditions
    const lockKey = parseInt(businessKey.replace(/\D/g, '').slice(0, 9) || '1', 10);
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    const matchRes = await client.query(`
      SELECT id, state, reputation_score 
      FROM entities 
      WHERE 1 - (embedding <=> $1::vector) >= $2 
      ORDER BY embedding <=> $1::vector ASC 
      LIMIT 1
    `, [embString, THRESHOLD]);

    let entityId;
    if (matchRes.rows.length > 0) {
      const match = matchRes.rows[0];
      entityId = match.id;
      const newState = computeNextState(match.state, parseFloat(match.reputation_score));
      await client.query(
        'UPDATE entities SET state = $1, reputation_score = $2 WHERE id = $3',
        [newState.state, newState.reputation_score, entityId]
      );
    } else {
      const insertRes = await client.query(
        'INSERT INTO entities (business_key, embedding, state, reputation_score) VALUES ($1, $2, $3, $4) RETURNING id',
        [businessKey, embString, 'NEW', 1.0]
      );
      entityId = insertRes.rows[0].id;
    }

    await client.query('INSERT INTO processed_events (event_id) VALUES ($1)', [eventId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}, { connection: { host: 'localhost', port: 6379 }, concurrency: 5 });