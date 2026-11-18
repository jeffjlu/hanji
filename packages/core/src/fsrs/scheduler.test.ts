import { describe, expect, it } from 'vitest';
import { buildSchedulers } from './scheduler.js';

describe('buildSchedulers', () => {
  it('throws when asked for a retention it did not build', async () => {
    const getScheduler = await buildSchedulers([0.9]);
    expect(() => getScheduler(0.8)).toThrow('No scheduler for retention 0.8');
  });
});
