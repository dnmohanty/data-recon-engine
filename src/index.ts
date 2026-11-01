import express from 'express';
import { Queue } from 'bullmq';
import { createClient } from 'redis';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const ingestQueue = new Queue('ingest', { connection: { host: 'localhost', port: 6379 } });
const redisSub = createClient({ url: 'redis://localhost:6379' });
redisSub.connect();

app.post('/ingest', async (req, res) => {
  const { businessKey, data } = req.body;
  const eventId = String(req.body.eventId); // Coerce to string

  if (!eventId || !businessKey) return res.status(400).send('Missing eventId or businessKey');

  await ingestQueue.add('event', { eventId, businessKey, data }, { jobId: eventId });
  res.status(202).send({ status: 'queued', eventId });
});

app.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); 

  const listener = (message: string) => {
    const payload = JSON.parse(message);
    res.write(`id: ${payload.id}\n`);
    res.write(`data: ${message}\n\n`);
  };

  redisSub.subscribe('entity_updates', listener);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  req.on('close', () => {
    redisSub.unsubscribe('entity_updates', listener);
    clearInterval(heartbeat);
  });
});

app.listen(3000, () => console.log('API listening on port 3000'));