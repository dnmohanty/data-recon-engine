import { Pool } from 'pg';
import { Queue } from 'bullmq';

const pool = new Pool({ user: 'user', host: 'localhost', database: 'recon', password: 'password', port: 5432 });
const ingestQueue = new Queue('ingest', { connection: { host: 'localhost', port: 6379 } });

async function runAssertions() {
  const client = await pool.connect();
  
  const entityCount = await client.query('SELECT COUNT(*) FROM entities');
  const failedJobs = await ingestQueue.getFailedCount();
  const processedEvents = await client.query('SELECT COUNT(*) FROM processed_events');

  console.log(`Entities Created: ${entityCount.rows[0].count} (Expected: 1)`);
  console.log(`Failed BullMQ Jobs: ${failedJobs} (Expected: 0)`);
  console.log(`Total Processed Events: ${processedEvents.rows[0].count}`);

  if (Number(entityCount.rows[0].count) !== 1 || failedJobs > 0) {
    console.error('❌ Assertions Failed.');
    process.exit(1);
  }
  
  console.log('✅ All Invariants Passed.');
  process.exit(0);
}

runAssertions();