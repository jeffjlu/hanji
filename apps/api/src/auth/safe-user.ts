import { type schema } from '@hanji/db';

export type SafeUser = Pick<schema.User, 'id' | 'email'>;
