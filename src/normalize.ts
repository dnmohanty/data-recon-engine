const LEGAL = new Set(['inc','incorporated','corp','corporation','co','company','llc','ltd','limited','plc','gmbh']);

export function normalizeName(s: string): string {
  const t = s.toLowerCase().replace(/['’]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  while (t.length > 1 && LEGAL.has(t[t.length - 1])) t.pop();
  return t.join(' ');
}