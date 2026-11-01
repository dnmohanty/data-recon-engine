export function computeNextState(currentState: string, currentScore: number) {
  const reputation_score = Math.min(currentScore + 0.5, 10.0);
  let state = currentState;

  if (reputation_score >= 5.0 && currentState === 'NEW') {
    state = 'VERIFIED';
  }

  return { state, reputation_score };
}