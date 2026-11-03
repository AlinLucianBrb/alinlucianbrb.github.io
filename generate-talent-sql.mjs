/* Prints SQL that copies the talent trees from js/content/talents.js into the database, so the server can check talent saves.
   Run it after you change any talent tree:   npm run talent-sql > talent-seed.sql
   Then paste the result into the Supabase SQL Editor. Safe to run more than once. (A test fails if the SQL files fall behind.) */
import { talentSeedSql } from './talent-sql.mjs';
process.stdout.write(talentSeedSql());
