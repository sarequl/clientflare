import { defineConfig } from 'drizzle-kit'

// Migrations are generated here and applied with `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
})
