import { pipeline } from '@xenova/transformers';

const pairs = [
  { a: "Acme Corp", b: "ACME Corporation", shouldMatch: true },
  { a: "Global Tech", b: "Global Technologies LLC", shouldMatch: true },
  { a: "Acme Corp", b: "Beta Industries", shouldMatch: false },
];

async function evaluate() {
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  let truePositives = 0, falsePositives = 0, falseNegatives = 0;
  const threshold = 0.90;

  for (const pair of pairs) {
    const embA = Array.from((await embedder(pair.a.toLowerCase(), { pooling: 'mean', normalize: true })).data);
    const embB = Array.from((await embedder(pair.b.toLowerCase(), { pooling: 'mean', normalize: true })).data);
    
    let similarity = 0;
    for (let i = 0; i < embA.length; i++) similarity += (embA[i] as number) * (embB[i] as number);

    const isMatch = similarity >= threshold;
    if (isMatch && pair.shouldMatch) truePositives++;
    if (isMatch && !pair.shouldMatch) falsePositives++;
    if (!isMatch && pair.shouldMatch) falseNegatives++;
  }

  const precision = truePositives / (truePositives + falsePositives || 1);
  const recall = truePositives / (truePositives + falseNegatives || 1);
  
  console.log(`Threshold: ${threshold} | Precision: ${(precision * 100).toFixed(1)}% | Recall: ${(recall * 100).toFixed(1)}%`);
}

evaluate();