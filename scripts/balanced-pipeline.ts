/**
 * Dev utility: run research + scripting on a balanced spread of prospects
 * (N per vertical) so scripts can be compared across business types. The cron
 * pipeline always takes the lowest-id "new" rows (currently all salons), so this
 * targets specific verticals instead.
 *
 * Run: npx tsx scripts/balanced-pipeline.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const VERTICALS = ["law", "hvac", "auto repair", "real estate", "dental"];
const PER_VERTICAL = 3;

async function main() {
  const { db } = await import("@/db");
  const { prospects } = await import("@/db/schema");
  const { and, eq, ne } = await import("drizzle-orm");
  const { researchProspect } = await import("@/lib/research");
  const { generateScripts } = await import("@/lib/scripts");

  const targets: { id: number; industry: string }[] = [];
  for (const v of VERTICALS) {
    const rows = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(and(eq(prospects.industry, v), ne(prospects.status, "scripted")))
      .limit(PER_VERTICAL);
    for (const r of rows) targets.push({ id: r.id, industry: v });
  }
  console.log(`targets: ${targets.length}`);

  for (const t of targets) {
    try {
      const [p] = await db
        .select({ status: prospects.status })
        .from(prospects)
        .where(eq(prospects.id, t.id))
        .limit(1);
      if (p.status !== "researched") await researchProspect(t.id);
      await generateScripts(t.id);
      console.log(`scripted ${t.industry} #${t.id}`);
    } catch (e) {
      console.error(`fail #${t.id} (${t.industry}): ${(e as Error).message}`);
    }
  }
  console.log("BALANCED DONE");
  process.exit(0);
}

main();
