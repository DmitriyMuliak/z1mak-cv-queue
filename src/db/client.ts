import { Pool } from "pg";
import { env } from "../config/env";

export const pool = env.pgUrl
  ? new Pool({ connectionString: env.pgUrl })
  : null;
