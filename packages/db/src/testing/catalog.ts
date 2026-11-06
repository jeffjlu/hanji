import { type Sql } from '../client.js';

// Returns the constraints for a given table in the public schema.
export async function getConstraints(sql: Sql, tableName: string) {
  const rows = await sql<{ constraint_type: string; constraint_definition: string }[]>`
      SELECT
        con.contype AS constraint_type,
        pg_catalog.pg_get_constraintdef(con.oid) AS constraint_definition
      FROM 
        pg_catalog.pg_constraint con
      INNER JOIN 
        pg_catalog.pg_class rel ON rel.oid = con.conrelid
      INNER JOIN 
        pg_catalog.pg_namespace nsp ON nsp.oid = con.connamespace
      WHERE 
        rel.relname = ${tableName}
        AND nsp.nspname = 'public';
      `;
  return [...rows];
}

// Returns the indexes for a given table in the public schema.
export async function getIndexes(sql: Sql, tableName: string) {
  const rows = await sql<{ index_name: string; is_unique: boolean }[]>`
      SELECT
        idx.indexrelid::regclass::text AS index_name,
        idx.indisunique AS is_unique
      FROM
        pg_catalog.pg_index idx
      INNER JOIN
        pg_catalog.pg_class rel ON rel.oid = idx.indrelid
      INNER JOIN
        pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE
        rel.relname = ${tableName}
        AND nsp.nspname = 'public';
      `;
  return [...rows];
}

// Returns a snapshot of the catalog (constraints, indexes, and columns) for the public schema.
export async function snapshotCatalog(sql: Sql) {
  const constraints = await sql`
      select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
      from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`;
  const indexes = await sql`
      select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`;
  const columns = await sql`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' order by table_name, ordinal_position`;
  return { constraints: [...constraints], indexes: [...indexes], columns: [...columns] };
}

// Returns the number of migrations that have been applied to the database.
export async function migrationsDone(sql: Sql): Promise<number> {
  const result = await sql`SELECT count(*) as COUNT from ${sql('drizzle.__drizzle_migrations')}`;
  return Number(result[0]?.['count'] ?? 0);
}
