import type { DbHandle } from '@hanji/db';
import { type Config } from './config.js';

export type Deps = DbHandle & { config: Config; now: () => Date };
