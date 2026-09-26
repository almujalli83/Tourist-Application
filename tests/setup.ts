import { rmSync } from "node:fs";

// The JSON file store serialises access within one process only: give each test worker its own file,
// and start every test file from an empty store (bookings would otherwise fill slots across runs).
process.env.DB_FILE = `.vitest-db-${process.env.VITEST_POOL_ID ?? "0"}.json`;
rmSync(process.env.DB_FILE, { force: true });
