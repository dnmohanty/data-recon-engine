import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 20,
  duration: '10s',
};

export default function () {
  const payload = JSON.stringify({
    eventId: `evt-${__VU}-${__ITER}`,
    businessKey: `target-company-A`,
    data: { name: 'Acme Corp' }
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post('http://localhost:3000/ingest', payload, params);
  check(res, {
    'accepted or ignored': (r) => r.status === 202 || r.status === 200,
  });
}