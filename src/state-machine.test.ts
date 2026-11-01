import { expect, test } from 'vitest';
import { computeNextState } from './stateMachine.js';

test('NEW state transitions to VERIFIED when score reaches 5.0', () => {
  const result = computeNextState('NEW', 4.5);
  expect(result.state).toBe('VERIFIED');
  expect(result.reputation_score).toBe(5.0);
});

test('VERIFIED state stays VERIFIED', () => {
  const result = computeNextState('VERIFIED', 5.0);
  expect(result.state).toBe('VERIFIED');
  expect(result.reputation_score).toBe(5.5);
});

test('Score caps at 10.0', () => {
  const result = computeNextState('VERIFIED', 9.8);
  expect(result.reputation_score).toBe(10.0);
});