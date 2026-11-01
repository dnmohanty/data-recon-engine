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
  const start = Date.now();
  await waitForDrain();
  console.log(`Queue drained in ${(Date.now() - start)}ms`);
  
  const client = await pool.connect();
  const entityCount = await client.query('SELECT COUNT(*) FROM entities');
  const processedEvents = await client.query('SELECT COUNT(*) FROM processed_events');
  const failedJobs = await ingestQueue.getFailedCount();

  const expectedEvents = Number(process.env.EXPECTED_EVENTS || 0);
  const expectedEntities = Number(process.env.EXPECTED_ENTITIES || 50);

  console.log(`Entities Created: ${entityCount.rows[0].count} (Expected: ${expectedEntities})`);
  console.log(`Failed BullMQ Jobs: ${failedJobs} (Expected: 0)`);
  console.log(`Total Processed Events: ${processedEvents.rows[0].count} (Expected: ${expectedEvents})`);

  if (Number(entityCount.rows[0].count) !== expectedEntities || failedJobs > 0 || Number(processedEvents.rows[0].count) !== expectedEvents) {
    console.error('❌ Assertions Failed.');
    process.exit(1);
  }
  
  console.log('✅ All Invariants Passed.');
  process.exit(0);
}

runAssertions();