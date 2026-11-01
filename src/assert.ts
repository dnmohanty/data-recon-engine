import { Pool } from 'pg';
import { Queue } from 'bullmq';

const pool = new Pool({ user: 'user', host: 'localhost', database: 'recon', password: 'password', port: 5432 });
const ingestQueue = new Queue('ingest', { connection: { host: 'localhost', port: 6379 } });

async function waitForDrain() {
  console.log('Waiting for queue to drain...');
  for (;;) {
    const counts = await ingestQueue.getJobCounts('waiting', 'active', 'delayed');
    if (counts.waiting + counts.active + counts.delayed === 0) return;
    await new Promise(r => setTimeout(r, 500));
  }
}

async function runAssertions() {
  await waitForDrain();
  
  const client = await pool.connect();
  const entityCount = await client.query('SELECT COUNT(*) FROM entities');
  const processedEvents = await client.query('SELECT COUNT(*) FROM processed_events');
  const badReputation = await client.query('SELECT COUNT(*) FROM entities WHERE reputation_score <> 2.0');
  const failedJobs = await ingestQueue.getFailedCount();

  const expectedEvents = 150; // K6 generates exactly 50 companies * 3 variants
  const expectedEntities = 50;

  console.log(`Entities Created: ${entityCount.rows[0].count} (Expected: ${expectedEntities})`);
  console.log(`Failed Jobs: ${failedJobs} (Expected: 0)`);
  console.log(`Processed Events: ${processedEvents.rows[0].count} (Expected: >=${expectedEvents})`);
  console.log(`Entities with lost/duplicated reputation (!= 2.0): ${badReputation.rows[0].count} (Expected: 0)`);

  if (Number(entityCount.rows[0].count) !== expectedEntities || failedJobs > 0 || Number(badReputation.rows[0].count) !== 0) {
    console.error('❌ Assertions Failed.');
    process.exit(1);
  }
  
  console.log('✅ All Invariants Passed.');
  process.exit(0);
}

runAssertions();