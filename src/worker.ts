import { Worker } from 'bullmq';
import { Pool } from 'pg';
import { pipeline } from '@xenova/transformers';
import { createClient } from 'redis';
import { THRESHOLD } from './config.js';
import { normalizeName } from './normalize.js';
import { computeNextState } from './stateMachine.js';

const pool = new Pool({ user: 'user', host: 'localhost', database: 'recon', password: 'password', port: 5432 });
const redisPub = createClient({ url: 'redis://localhost:6379' });
await redisPub.connect();

const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

const worker = new Worker('ingest', async job => {
  const { eventId, businessKey, data } = job.data;
  
  // Exact-key lookup fallback and normalization
  const normalizedName = normalizeName(data?.name ?? businessKey);
  const emb = Array.from((await embedder(normalizedName, { pooling: 'mean', normalize: true })).data);
  const embString = `[${emb.join(',')}]`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Atomic idempotency check (inserts first, drops if conflict exists)
    const checkRes = await client.query(
      'INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING RETURNING event_id', 
      [eventId]
    );
    if (checkRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return;
    }

    // Global advisory lock to prevent deduplication race conditions
    await client.query('SELECT pg_advisory_xact_lock(1)');

    let entityId;
    let newStateData;

    const exactRes = await client.query('SELECT id, state, reputation_score FROM entities WHERE business_key = $1', [businessKey]);
    
    if (exactRes.rows.length > 0) {
      const match = exactRes.rows[0];
      entityId = match.id;
      newStateData = computeNextState(match.state, parseFloat(match.reputation_score));
      
      await client.query(
        'UPDATE entities SET state = $1, reputation_score = $2 WHERE id = $3',
        [newStateData.state, newStateData.reputation_score, entityId]
      );
    } else {
      const matchRes = await client.query(`
        SELECT id, state, reputation_score 
        FROM entities 
        WHERE 1 - (embedding <=> $1::vector) >= $2 
        ORDER BY embedding <=> $1::vector ASC 
        LIMIT 1
      `, [embString, THRESHOLD]);

      if (matchRes.rows.length > 0) {
        const match = matchRes.rows[0];
        entityId = match.id;
        newStateData = computeNextState(match.state, parseFloat(match.reputation_score));
        
        await client.query(
          'UPDATE entities SET state = $1, reputation_score = $2 WHERE id = $3',
          [newStateData.state, newStateData.reputation_score, entityId]
        );
      } else {
        const insertRes = await client.query(
          'INSERT INTO entities (business_key, embedding, state, reputation_score) VALUES ($1, $2, $3, $4) RETURNING id',
          [businessKey, embString, 'NEW', 1.0]
        );
        entityId = insertRes.rows[0].id;
        newStateData = { state: 'NEW', reputation_score: 1.0 };
      }
    }

    await client.query('COMMIT');
    
    // 1. Publish in its own try/catch AFTER commit so Redis errors don't rollback Postgres
    try {
      await redisPub.publish('entity_updates', JSON.stringify({ 
        id: entityId, 
        state: newStateData.state, 
        reputation: newStateData.reputation_score 
      }));
    } catch (pubErr) {
      console.error('Failed to publish to SSE:', pubErr);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}, { connection: { host: 'localhost', port: 6379 }, concurrency: 5 });

worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err));