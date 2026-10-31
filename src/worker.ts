import { Worker } from 'bullmq';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { pipeline } from '@xenova/transformers';
import { calculateNewState } from './stateMachine.js';

const pool = new Pool({
  user: 'user',
  host: 'localhost',
  database: 'recon',
  password: 'password',
  port: 5432,
});

const redisPub = createClient({ url: 'redis://localhost:6379' });

class EmbeddingPipeline {
  static task = 'feature-extraction' as const;
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance: any = null;

  static async getInstance() {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model);
    }
    return this.instance;
  }
}

const worker = new Worker('ingest', async (job) => {
  if (!redisPub.isOpen) await redisPub.connect();
  
  const { eventId, businessKey, data } = job.data;
  
  const textToEmbed = (data?.name || businessKey).toLowerCase().trim();
  const embedder = await EmbeddingPipeline.getInstance();
  const output = await embedder(textToEmbed, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data);
  const embeddingStr = `[${embedding.join(',')}]`;
  const threshold = 0.90;

  const client = await pool.connect();
  let publishPayload = null;

  try {
    await client.query('BEGIN');
    
    const eventRes = await client.query(
      `INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [eventId]
    );
    
    if (eventRes.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log(`Event ${eventId} already processed. Skipping.`);
      return; 
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [businessKey]);

    const searchRes = await client.query(
      `SELECT id, state, reputation_score, 1 - (embedding <=> $1::vector) AS similarity 
       FROM entities 
       ORDER BY embedding <=> $1::vector 
       LIMIT 1`,
      [embeddingStr]
    );

    const match = searchRes.rows[0];

    if (!match || match.similarity < threshold) {
      const insertRes = await client.query(
        `INSERT INTO entities (business_key, embedding, state, reputation_score) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (business_key) DO NOTHING RETURNING id`,
        [businessKey, embeddingStr, 'NEW', 1.0]
      );
      
      if (insertRes.rows.length > 0) {
        publishPayload = { id: insertRes.rows[0].id, state: 'NEW', reputation: 1.0 };
      }
    } else {
      const { state: newState, reputation: newRep } = calculateNewState(match.reputation_score, 0.5);
      
      const updateRes = await client.query(
        `UPDATE entities 
         SET state = $1, reputation_score = $2
         WHERE id = $3 RETURNING id, state, reputation_score`,
        [newState, newRep, match.id]
      );
      
      publishPayload = { 
        id: updateRes.rows[0].id, 
        state: updateRes.rows[0].state, 
        reputation: updateRes.rows[0].reputation_score 
      };
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; 
  } finally {
    client.release();
  }

  if (publishPayload) {
    await redisPub.publish('entity_updates', JSON.stringify(publishPayload));
  }

}, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 10 
});