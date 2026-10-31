export function calculateNewState(currentReputation: number, currentScore: number = 0.5): { state: string, reputation: number } {
  const newReputation = Math.min(Number(currentReputation) + currentScore, 10.0);
  
  let newState = 'NEW';
  if (newReputation >= 5.0) newState = 'VERIFIED';
  if (newReputation >= 8.0) newState = 'TRUSTED';

  return { state: newState, reputation: newReputation };
}