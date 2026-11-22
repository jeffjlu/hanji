import { Rating } from '@hanji/schemas';

export const MIN_SAMPLES_FOR_SLOWNESS = 5;
export const SLOW_FACTOR = 2;

export type GradeInput = {
  correct: boolean;
  hintUsed: boolean;
  easyChosen: boolean;
  responseMs: number;
  medianMs: number | null;
  sampleCount: number;
};

export function gradeAnswer(input: GradeInput): Rating {
  if (!input.correct) return Rating.Again;
  else if (!input.hintUsed && input.easyChosen) return Rating.Easy;
  else if ((enoughSamples(input) && slowResponse(input)) || input.hintUsed) return Rating.Hard;
  else return Rating.Good;
}

function enoughSamples(input: GradeInput) {
  return input.sampleCount >= MIN_SAMPLES_FOR_SLOWNESS;
}

function slowResponse(input: GradeInput) {
  return (
    input.medianMs !== null && input.medianMs > 0 && input.responseMs > SLOW_FACTOR * input.medianMs
  );
}
