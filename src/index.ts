import express, { Request, Response } from 'express';
import { Queue } from 'bullmq';
import { createClient } from 'redis';
import cors from 'cors';
import { Redis } from 'ioredis';
import rateLimit from 'express-rate-limit';

const app = express();
app.use(cors());
app.use(express.json());

// 1. Rate Limiting (max 50 requests per 15 mins per IP)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 50, 
  message: 'Demo rate limit exceeded. Please try again later.'
});
app.use('/ingest', apiLimiter);
app.use('/demo', apiLimiter);

// Use the live URLs if we are in production, otherwise use localhost
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const ingestQueue = new Queue('ingest', { connection });
const redisSub = createClient({ url: redisUrl });
redisSub.connect();

// 2. Public Demo Route to light up the dashboard
app.get('/demo', async (req: Request, res: Response) => {
  const companies = ['Apex', 'Vertex', 'Zenith', 'Quantum', 'Nexus'];
  let count = 0;
  for (const comp of companies) {
    for (let i = 1; i <= 3; i++) { // Send 3 events per company to trigger deduplication
      const eventId = `demo_${Date.now()}_${count++}`;
      await ingestQueue.add('event', { 
        eventId, 
        businessKey: `${comp}-1`, 
        data: { name: `${comp} Corp ${i}` } 
      });
    }
  }
  res.status(202).send({ status: 'Demo data queued! Watch the dashboard.' });
});

app.post('/ingest', async (req: Request, res: Response): Promise<any> => {
  const { eventId: rawId, businessKey, data, jobId } = req.body ?? {};
  
  if (rawId == null || rawId === '' || !businessKey) return res.status(400).send('Missing eventId or businessKey');
  
  const eventId = String(rawId);
  const finalJobId = (process.env.NODE_ENV === 'test' && jobId) ? String(jobId) : eventId;

  await ingestQueue.add('event', { eventId, businessKey, data }, { 
    jobId: finalJobId,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 1000 }
  });
  
  res.status(202).send({ status: 'queued', eventId });
});

app.get('/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const listener = (message: string) => res.write(`data: ${message}\n\n`);
  await redisSub.subscribe('entity_updates', listener);

  req.on('close', () => redisSub.unsubscribe('entity_updates', listener));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));