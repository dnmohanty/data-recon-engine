import express from 'express';
import { createClient } from 'redis';
import { Queue } from 'bullmq';
import { z } from 'zod';

const app = express();
app.use(express.json());

const redisClient = createClient({ url: 'redis://localhost:6379' });
const redisSubscriber = redisClient.duplicate();

const ingestQueue = new Queue('ingest', {
  connection: { host: 'localhost', port: 6379 }
});

const eventSchema = z.object({
  eventId: z.string(),
  businessKey: z.string(),
  data: z.any()
});

app.post('/ingest', async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error);
  }

  const { eventId, businessKey, data } = parsed.data;

  const isNew = await redisClient.set(`event:${eventId}`, '1', {
    NX: true,
    EX: 86400
  });

  if (!isNew) {
    return res.status(200).json({ status: 'ignored', reason: 'duplicate_event' });
  }

  await ingestQueue.add('process_entity', { eventId, businessKey, data }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  });

  res.status(202).json({ status: 'accepted' });
});

app.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const lastEventId = req.headers['last-event-id'] || '0';
  
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  const listener = (message: string, channel: string) => {
    const id = Date.now().toString();
    res.write(`id: ${id}\n`);
    res.write(`data: ${message}\n\n`);
  };

  await redisSubscriber.subscribe('entity_updates', listener);

  req.on('close', () => {
    clearInterval(heartbeat);
    redisSubscriber.unsubscribe('entity_updates', listener);
  });
});

async function start() {
  await redisClient.connect();
  await redisSubscriber.connect();
  app.listen(3000, () => {
    console.log('API listening on port 3000');
  });
}

start();