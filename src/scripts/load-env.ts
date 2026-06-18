// Side-effect module: load .env.local (then .env) before any module that reads
// process.env at import time (e.g. lib/config). Import this FIRST in a script so
// it evaluates before the rest of the module graph.
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();
