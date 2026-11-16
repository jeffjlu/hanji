import { Rating as FsrsRating } from 'ts-fsrs';
import { Rating } from '@hanji/schemas';

export const TO_FSRS_RATING = {
  [Rating.Again]: FsrsRating.Again,
  [Rating.Hard]: FsrsRating.Hard,
  [Rating.Good]: FsrsRating.Good,
  [Rating.Easy]: FsrsRating.Easy,
} as const satisfies Record<Rating, FsrsRating>;
