import http from 'k6/http';
import { check } from 'k6';

export const options = { vus: 20, duration: '10s' };
const RUN_ID = __ENV.RUN_ID || Date.now();

// 50 semantically distinct base names so the AI doesn't confuse them
const bases = [
  'Apex', 'Vertex', 'Zenith', 'Quantum', 'Nexus', 'Omega', 'Stratos', 'Orion', 'Horizon', 'Titan',
  'Atlas', 'Cobalt', 'Ignis', 'Terra', 'Nova', 'Pulse', 'Echo', 'Sierra', 'Tango', 'Delta',
  'Vanguard', 'Pinnacle', 'Summit', 'Crest', 'Meridian', 'Stellar', 'Solar', 'Lunar', 'Astro', 'Cosmo',
  'Cyber', 'Data', 'Logic', 'Network', 'Web', 'Cloud', 'Stream', 'Flow', 'Wave', 'Tide',
  'Stone', 'Iron', 'Steel', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby', 'Sapphire'
];

const companies = bases.map(base => ({
  base: base,
  variants: [`${base} Corp`, `${base} Incorporated`, `${base}, Inc.`]
}));

export default function () {
  const comp = companies[Math.floor(Math.random() * companies.length)];
  const variant = comp.variants[Math.floor(Math.random() * comp.variants.length)];
  const eventId = `evt_${RUN_ID}_${comp.base}_${variant.replace(/[^a-zA-Z]/g, '')}`;
  
  const payload = JSON.stringify({ eventId, businessKey: comp.base, data: { name: variant } });
  const params = { headers: { 'Content-Type': 'application/json' } };

  const res = http.post('http://localhost:3000/ingest', payload, params);
  check(res, { 'status is 202': (r) => r.status === 202 });
  
  // Fire duplicate to test idempotency race condition
  http.post('http://localhost:3000/ingest', payload, params);
}