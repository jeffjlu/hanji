import { type User } from '@hanji/db';

export type SafeUser = Pick<User, 'id' | 'email'>;
