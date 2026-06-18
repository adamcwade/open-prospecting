// Roll the current script format across every prospect that already has a
// script: re-generates the voice + SMS scripts in place via regenerateScript,
// WITHOUT changing any prospect's pipeline status. Idempotent (safe to re-run).
//
// Run: npx tsx src/scripts/regenerate-scripts.ts
// Validate on one first: REGEN_LIMIT=1 npx tsx src/scripts/regenerate-scripts.ts
import "./load-env";
import { db } from "@/db";
import { scripts } from "@/db/schema";
import { regenerateScript } from "@/lib/scripts";

async function main() {
  // REGEN_IDS=24,25 targets specific prospects (e.g. to retry failures).
  const targeted = (process.env.REGEN_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n));

  let ids: number[];
  if (targeted.length) {
    ids = targeted;
  } else {
    const rows = await db
      .selectDistinct({ prospectId: scripts.prospectId })
      .from(scripts);
    const limit = Number(process.env.REGEN_LIMIT ?? Infinity);
    ids = rows.map((r) => r.prospectId).slice(0, limit);
  }

  console.log(
    `Regenerating scripts for ${ids.length} prospect(s)` +
      (targeted.length ? " (targeted)" : "") +
      "..."
  );

  let done = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const ok = await regenerateScript(id);
      if (ok) {
        done++;
        console.log(`  prospect ${id}: script regenerated`);
      } else {
        console.log(`  prospect ${id}: skipped (no existing script)`);
      }
    } catch (e) {
      failed++;
      console.error(`  prospect ${id} FAILED:`, (e as Error).message);
    }
  }

  console.log(`Done. Regenerated ${done}${failed ? `, ${failed} failed` : ""}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
