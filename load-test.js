import http from 'k6/http';
import { check } from 'k6';

export const options = { vus: 20, duration: '10s' };
const RUN_ID = `run_${Date.now()}`; 

const variants = [
  { key: "acme-1", name: "Acme Corp" },
  { key: "acme-2", name: "ACME Corporation" },
  { key: "acme-3", name: "Acme, Inc." },
];

export default function () {
  const variant = variants[Math.floor(Math.random() * variants.length)];
  const eventId = `${RUN_ID}_evt_${__VU}_${__ITER}`;
  
  const payload = JSON.stringify({ eventId, businessKey: variant.key, data: { name: variant.name } });
  const params = { headers: { 'Content-Type': 'application/json' } };

  // Initial event
  http.post('http://localhost:3000/ingest', payload, params);
  
  // Send immediate duplicate
  const res = http.post('http://localhost:3000/ingest', payload, params);
  check(res, { 'status is 202': (r) => r.status === 202 });
}