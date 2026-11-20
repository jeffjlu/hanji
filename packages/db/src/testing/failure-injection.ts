import { sql } from 'drizzle-orm';
import type { Database } from '../client.js';

/** Makes every UPDATE on app_user fail, so a sync transaction aborts after inserting events. */
export async function installLastSeqFailure(db: Database): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION test_fail_app_user_update() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'injected failure'; END;
    $$ LANGUAGE plpgsql
  `);
  await db.execute(sql`
    CREATE TRIGGER test_fail_app_user_update
    BEFORE UPDATE ON app_user
    FOR EACH ROW EXECUTE FUNCTION test_fail_app_user_update()
  `);
}

export async function removeLastSeqFailure(db: Database): Promise<void> {
  await db.execute(sql`DROP TRIGGER IF EXISTS test_fail_app_user_update ON app_user`);
  await db.execute(sql`DROP FUNCTION IF EXISTS test_fail_app_user_update()`);
}