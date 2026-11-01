import { Worker } from 'bullmq';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { pipeline } from '@xenova/transformers';
import { calculateNewState } from './stateMachine.js';

const pool = new Pool({ user: 'user', host: 'localhost', database: 'recon', password: 'password', port: 5432 });
const redisPub = createClient({ url: 'redis://localhost:6379' });

class EmbeddingPipeline {
  static instance: any = null;
  static async getInstance() {
    if (!this.instance) this.instance = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return this.instance;
  }
}

const worker = new Worker('ingest', async (job) => {
  if (!redisPub.isOpen) await redisPub.connect();
  const { eventId, businessKey, data } = job.data;
  
  const textToEmbed = (data?.name || businessKey).toLowerCase().trim();
  const embedder = await EmbeddingPipeline.getInstance();
  const output = await embedder(textToEmbed, { pooling: 'mean', normalize: true });
  const embeddingStr = `[${Array.from(output.data).join(',')}]`;
  const threshold = 0.90;

  const client = await pool.connect();
  let publishPayload = null;

  try {
    await client.query('BEGIN');

    const eventRes = await client.query(
      `INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id`, [eventId]
    );
    if (eventRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query('SELECT pg_advisory_xact_lock(1)');

    let match = null;
    const exactRes = await client.query(`SELECT id, state, reputation_score FROM entities WHERE business_key = $1 FOR UPDATE`, [businessKey]);
    
    if (exactRes.rows.length > 0) {
      match = exactRes.rows[0];
    } else {
      const searchRes = await client.query(
        `SELECT id, state, reputation_score, 1 - (embedding <=> $1::vector) AS similarity 
         FROM entities ORDER BY embedding <=> $1::vector LIMIT 1`, [embeddingStr]
      );
      if (searchRes.rows[0] && searchRes.rows[0].similarity >= threshold) {
        match = searchRes.rows[0];
        await client.query(`SELECT id FROM entities WHERE id = $1 FOR UPDATE`, [match.id]);
      }
    }


    if (!match) {
      const insertRes = await client.query(
        `INSERT INTO entities (business_key, embedding, state, reputation_score) VALUES ($1, $2, $3, $4) RETURNING id`,
        [businessKey, embeddingStr, 'NEW', 1.0]
      );
      publishPayload = { id: insertRes.rows[0].id, state: 'NEW', reputation: 1.0 };
    } else {
      const { state: newState, reputation: newRep } = calculateNewState(match.reputation_score, 0.5);
      const updateRes = await client.query(
        `UPDATE entities SET state = $1, reputation_score = $2 WHERE id = $3 RETURNING id, state, reputation_score`,
        [newState, newRep, match.id]
      );
      publishPayload = { id: updateRes.rows[0].id, state: updateRes.rows[0].state, reputation: updateRes.rows[0].reputation_score };
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (publishPayload) await redisPub.publish('entity_updates', JSON.stringify(publishPayload));
}, { connection: { host: 'localhost', port: 6379 }, concurrency: 10 });