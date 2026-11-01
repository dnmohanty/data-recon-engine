import http from 'k6/http';
import { check } from 'k6';

export const options = { vus: 20, duration: '10s' };
const RUN_ID = __ENV.RUN_ID || 'test';

const bases = [
  'Apex', 'Vertex', 'Zenith', 'Quantum', 'Nexus', 'Omega', 'Stratos', 'Orion', 'Horizon', 'Titan',
  'Atlas', 'Cobalt', 'Ignis', 'Terra', 'Nova', 'Pulse', 'Echo', 'Sierra', 'Tango', 'Delta',
  'Vanguard', 'Pinnacle', 'Summit', 'Crest', 'Meridian', 'Stellar', 'Solar', 'Lunar', 'Astro', 'Cosmo',
  'Cyber', 'Data', 'Logic', 'Network', 'Web', 'Cloud', 'Stream', 'Flow', 'Wave', 'Tide',
  'Stone', 'Iron', 'Steel', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby', 'Sapphire'
];

const companies = bases.map(base => ({
  variants: [
    { key: `${base}-1`, name: `${base} Corp` },
    { key: `${base}-2`, name: `${base} Incorporated` },
    { key: `${base}-3`, name: `${base}, Inc.` }
  ]
}));

export default function () {
  const comp = companies[Math.floor(Math.random() * companies.length)];
  const variant = comp.variants[Math.floor(Math.random() * comp.variants.length)];
  
  const eventId = `evt_${RUN_ID}_${variant.key}`;
  const payload = JSON.stringify({ eventId, businessKey: variant.key, data: { name: variant.name } });
  const params = { headers: { 'Content-Type': 'application/json' } };

  const res = http.post('http://localhost:3000/ingest', payload, params);
  check(res, { 'status is 202': (r) => r.status === 202 });
  
  // Bypass BullMQ's dedup with a mutated jobId, but keep eventId identical to test DB constraints!
  const duplicatePayload = JSON.stringify({ 
    eventId: eventId,             // EXACT SAME EVENT ID
    jobId: `${eventId}_retry`,    // DIFFERENT JOB ID 
    businessKey: variant.key, 
    data: { name: variant.name } 
  });
  http.post('http://localhost:3000/ingest', duplicatePayload, params);
}