import { test, expect } from 'vitest';

function calculateTransition(currentState: string, currentReputation: number, bump: number) {
  const newReputation = Math.min(currentReputation + bump, 10.0);
  const newState = newReputation >= 5.0 ? 'VERIFIED' : currentState;
  return { state: newState, reputation: newReputation };
}

test.each([
  ['NEW', 1.0, 0.5, 'NEW', 1.5],
  ['NEW', 4.5, 0.5, 'VERIFIED', 5.0],
  ['VERIFIED', 5.0, 0.5, 'VERIFIED', 5.5],
  ['VERIFIED', 9.5, 1.0, 'VERIFIED', 10.0],
  ['VERIFIED', 10.0, 0.5, 'VERIFIED', 10.0],
])('transition %s @ %f + %f -> %s @ %f', (state, rep, bump, expectedState, expectedRep) => {
  const result = calculateTransition(state, rep, bump);
  expect(result.state).toBe(expectedState);
  expect(result.reputation).toBe(expectedRep);
});