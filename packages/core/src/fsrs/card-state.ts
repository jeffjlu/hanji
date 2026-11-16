import { State } from 'ts-fsrs';
import { type CardStateName } from '@hanji/schemas';

export const STATE_TO_NAME = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
} as const satisfies Record<State, CardStateName>;

export const NAME_TO_STATE = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
} as const satisfies Record<CardStateName, State>;
