// One-time backfill: populate `research_tasks.bullets` for tasks created before
// the column existed. Generates short bullets from each task's existing
// title/description via the LLM, one batched call per prospect. Does NOT touch
// titles, descriptions, impact, or prospect status. Idempotent — only rows with
// empty bullets are processed, so it is safe to re-run.
//
// Run: npx tsx src/scripts/backfill-task-bullets.ts
import "./load-env";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { researchTasks } from "@/db/schema";
import { generateBulletsForTasks } from "@/lib/research";

async function main() {
  const all = await db
    .select()
    .from(researchTasks)
    .orderBy(researchTasks.prospectId, researchTasks.position);

  const pending = all.filter((t) => !t.bullets || t.bullets.length === 0);
  if (pending.length === 0) {
    console.log("No tasks need backfilling. Done.");
    return;
  }

  const byProspect = new Map<number, typeof pending>();
  for (const t of pending) {
    const arr = byProspect.get(t.prospectId) ?? [];
    arr.push(t);
    byProspect.set(t.prospectId, arr);
  }

  // Optional cap (e.g. BACKFILL_LIMIT=1) to validate output before the full run.
  const limit = Number(process.env.BACKFILL_LIMIT ?? Infinity);
  const groups = [...byProspect.entries()].slice(0, limit);

  console.log(
    `Backfilling ${pending.length} tasks across ${byProspect.size} prospects` +
      (Number.isFinite(limit) ? ` (limited to ${groups.length})` : "") +
      "..."
  );

  let updated = 0;
  let failed = 0;
  for (const [prospectId, tasks] of groups) {
    try {
      const bullets = await generateBulletsForTasks(
        tasks.map((t) => ({ title: t.title, description: t.description }))
      );
      for (let i = 0; i < tasks.length; i++) {
        const b = bullets[i];
        if (!b || b.length === 0) continue;
        await db
          .update(researchTasks)
          .set({ bullets: b })
          .where(eq(researchTasks.id, tasks[i].id));
        updated++;
      }
      console.log(`  prospect ${prospectId}: ${tasks.length} tasks → bullets`);
    } catch (e) {
      failed++;
      console.error(`  prospect ${prospectId} FAILED:`, (e as Error).message);
    }
  }

  console.log(
    `Done. Updated ${updated} tasks${failed ? `, ${failed} prospects failed` : ""}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
