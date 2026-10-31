import { Worker } from 'bullmq';
import { Pool } from 'pg';
import { createClient } from 'redis';

const pool = new Pool({
  user: 'user',
  host: 'localhost',
  database: 'recon',
  password: 'password',
  port: 5432,
});

const redisPub = createClient({ url: 'redis://localhost:6379' });

const worker = new Worker('ingest', async (job) => {
  if (!redisPub.isOpen) await redisPub.connect();
  
  const { eventId, businessKey, data } = job.data;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const lockRes = await client.query(
      'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked', 
      [businessKey]
    );
    
    if (!lockRes.rows[0].locked) {
      await client.query('ROLLBACK');
      throw new Error('Concurrent modification lock active, retrying via BullMQ');
    }

    const embedding = Array.from({ length: 384 }, () => Math.random());
    const embeddingStr = `[${embedding.join(',')}]`;
    const threshold = 0.90;

    const searchRes = await client.query(
      `SELECT id, 1 - (embedding <=> $1::vector) AS similarity 
       FROM entities 
       WHERE 1 - (embedding <=> $1::vector) > $2 
       ORDER BY similarity DESC LIMIT 1`,
      [embeddingStr, threshold]
    );

    let matchId;

    if (searchRes.rows.length === 0) {
      const insertRes = await client.query(
        `INSERT INTO entities (business_key, embedding, state, reputation_score) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (business_key) DO NOTHING RETURNING id`,
        [businessKey, embeddingStr, 'NEW', 1.0]
      );
      if (insertRes.rows.length > 0) {
        matchId = insertRes.rows[0].id;
        await redisPub.publish('entity_updates', JSON.stringify({ id: matchId, state: 'NEW', reputation: 1.0 }));
      }
    } else {
      matchId = searchRes.rows[0].id;
      const updateRes = await client.query(
        `UPDATE entities 
         SET reputation_score = LEAST(reputation_score + 0.5, 10.0),
             state = CASE WHEN reputation_score + 0.5 >= 5.0 THEN 'VERIFIED' ELSE state END
         WHERE id = $1 RETURNING state, reputation_score`,
        [matchId]
      );
      const updated = updateRes.rows[0];
      await redisPub.publish('entity_updates', JSON.stringify({ id: matchId, state: updated.state, reputation: updated.reputation_score }));
    }
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}, {
  connection: { host: 'localhost', port: 6379 }
});