// The JSON file store serialises access within one process only: give each test worker its own file.
process.env.DB_FILE = `.vitest-db-${process.env.VITEST_POOL_ID ?? "0"}.json`;
