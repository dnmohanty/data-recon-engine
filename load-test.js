import http from 'k6/http';
import { check } from 'k6';

export const options = { vus: 20, duration: '10s' };

const variants = [
  { key: "acme-1", name: "Acme Corp" },
  { key: "acme-2", name: "ACME Corporation" },
  { key: "acme-3", name: "Acme, Inc." },
];

export default function () {
  const variant = variants[Math.floor(Math.random() * variants.length)];
  const eventId = `evt_${__VU}_${__ITER}`; // Base event ID
  
  const payload = JSON.stringify({ eventId, businessKey: variant.key, data: { name: variant.name } });
  const params = { headers: { 'Content-Type': 'application/json' } };

  http.post('http://localhost:3000/ingest', payload, params);
  
  const res = http.post('http://localhost:3000/ingest', payload, params);
  check(res, { 'status is 202': (r) => r.status === 202 });
}