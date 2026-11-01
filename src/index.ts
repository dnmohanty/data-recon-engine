import express, { Request, Response } from 'express';
import { Queue } from 'bullmq';
import { createClient } from 'redis';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const ingestQueue = new Queue('ingest', { connection: { host: 'localhost', port: 6379 } });
const redisSub = createClient({ url: 'redis://localhost:6379' });
redisSub.connect();

app.post('/ingest', async (req: Request, res: Response): Promise<any> => {
  const { eventId: rawId, businessKey, data } = req.body ?? {};
  
  if (rawId == null || rawId === '' || !businessKey) {
    return res.status(400).send('Missing eventId or businessKey');
  }
  
  const eventId = String(rawId);

  await ingestQueue.add('event', { eventId, businessKey, data }, { 
    jobId: eventId,
    removeOnComplete: { count: 1000 }
  });
  
  res.status(202).send({ status: 'queued', eventId });
});

app.listen(3000, () => console.log('API listening on port 3000'));