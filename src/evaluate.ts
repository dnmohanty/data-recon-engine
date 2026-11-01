import { pipeline } from '@xenova/transformers';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeName } from './normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function evaluate() {
  const pairsRaw = await fs.readFile(path.join(__dirname, 'pairs.json'), 'utf-8');
  const pairs = JSON.parse(pairsRaw);

  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  console.log(`Computing embeddings for ${pairs.length} pairs...\n`);
  const computedPairs = await Promise.all(pairs.map(async (p: any) => {
    const normA = normalizeName(p.a);
    const normB = normalizeName(p.b);
    const embA = Array.from((await embedder(normA, { pooling: 'mean', normalize: true })).data) as number[];
    const embB = Array.from((await embedder(normB, { pooling: 'mean', normalize: true })).data) as number[];
    return { ...p, embA, embB };
  }));

  console.log('Sweeping Thresholds...');
  for (let t = 0.60; t <= 0.95; t += 0.02) {
    let tp = 0, fp = 0, fn = 0;

    for (const p of computedPairs) {
      let similarity = 0;
      for (let i = 0; i < p.embA.length; i++) similarity += p.embA[i] * p.embB[i];

      const isMatch = similarity >= t;
      if (isMatch && p.shouldMatch) tp++;
      if (isMatch && !p.shouldMatch) fp++;
      if (!isMatch && p.shouldMatch) fn++;
    }

    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    console.log(`Threshold: ${t.toFixed(2)} | Precision: ${(precision * 100).toFixed(1)}% | Recall: ${(recall * 100).toFixed(1)}%`);
  }
}

evaluate();