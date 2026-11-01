import { pipeline } from '@xenova/transformers';

export const THRESHOLD = 0.90; 

const pairs = [
  { a: "Acme Corp", b: "ACME Corporation", shouldMatch: true },
  { a: "Acme Corp", b: "Acme Labs", shouldMatch: false }, // Hard negative
  { a: "Apple Inc", b: "Apple Records", shouldMatch: false }, // Hard negative
  { a: "Stripe", b: "Stripe, Inc.", shouldMatch: true },
  { a: "Stripe", b: "Striper Fishing Co", shouldMatch: false },
  { a: "McDonald's", b: "McDonalds Corporation", shouldMatch: true },
  { a: "McDonald's", b: "McDowell's", shouldMatch: false },

];

async function evaluate() {
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const thresholdsToTest = [0.75, 0.80, 0.85, 0.90, 0.95];

  console.log('Sweeping Thresholds...\n');
  
  for (const t of thresholdsToTest) {
    let tp = 0, fp = 0, fn = 0;

    for (const pair of pairs) {
      const embA = Array.from((await embedder(pair.a.toLowerCase(), { pooling: 'mean', normalize: true })).data);
      const embB = Array.from((await embedder(pair.b.toLowerCase(), { pooling: 'mean', normalize: true })).data);
      
      let similarity = 0;
      for (let i = 0; i < embA.length; i++) similarity += (embA[i] as number) * (embB[i] as number);

      const isMatch = similarity >= t;
      if (isMatch && pair.shouldMatch) tp++;
      if (isMatch && !pair.shouldMatch) fp++;
      if (!isMatch && pair.shouldMatch) fn++;
    }

    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    console.log(`Threshold: ${t.toFixed(2)} | Precision: ${(precision * 100).toFixed(1)}% | Recall: ${(recall * 100).toFixed(1)}%`);
  }
}

evaluate();