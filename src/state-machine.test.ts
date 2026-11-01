import { expect, test } from 'vitest';
import { calculateNewState } from './stateMachine.js';

test('transitions to VERIFIED at 5.0', () => {
  const result = calculateNewState(4.5, 0.5);
  expect(result.state).toBe('VERIFIED');
  expect(result.reputation).toBe(5.0);
});

test('transitions to TRUSTED at 8.0', () => {
  const result = calculateNewState(7.5, 0.5);
  expect(result.state).toBe('TRUSTED');
  expect(result.reputation).toBe(8.0);
});

test('caps reputation at 10.0', () => {
  const result = calculateNewState(9.8, 0.5);
  expect(result.state).toBe('TRUSTED');
  expect(result.reputation).toBe(10.0);
});