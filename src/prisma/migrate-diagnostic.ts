import { createConnection } from "mysql2/promise";

// Additive, resumable migration for the existing database (which predates Prisma Migrate).
// Existing leads and the historical admin table are preserved.
export const DIAGNOSTIC_COLUMNS: Record<string, string> = {
  quizVersion: "INT NOT NULL DEFAULT 1",
  preferredChannel: "VARCHAR(20) NULL",
  travelFrequency: "VARCHAR(40) NULL",
  purchaseChannel: "VARCHAR(40) NULL",
  monthlySpend: "VARCHAR(40) NULL",
  mainCard: "VARCHAR(40) NULL",
  cardIssuer: "VARCHAR(60) NULL",
  pointsRelationship: "VARCHAR(40) NULL",
  hasPoints: "VARCHAR(40) NULL",
  pointsPrograms: "JSON NULL",
  pointsAmount: "VARCHAR(40) NULL",
  tripInMind: "VARCHAR(40) NULL",
  tripDestination: "VARCHAR(60) NULL",
  tripDestinationOther: "VARCHAR(120) NULL",
  tripWhen: "VARCHAR(40) NULL",
  tripTravelers: "VARCHAR(40) NULL",
  tripCabin: "VARCHAR(40) NULL",
  tripDetailsSaved: "BOOLEAN NOT NULL DEFAULT FALSE",
  profileSummary: "TEXT NULL",
  segment: "VARCHAR(20) NULL",
  priority: "VARCHAR(20) NULL",
  completedAt: "DATETIME(3) NULL",
};
export async function migrateDiagnosticSchema() {
  if (!process.env.MYSQL_URL) throw new Error("MYSQL_URL is required.");
  const db = await createConnection(process.env.MYSQL_URL);
  try {
    const [lock] = await db.query(
      "SELECT GET_LOCK('travion_diagnostic_v2',120) AS acquired",
    );
    if ((lock as { acquired: number }[])[0]?.acquired !== 1)
      throw new Error("Migration lock unavailable.");
    const [rows] = await db.query(
      "SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Lead'",
    );
    const existing = new Map(
      (rows as { name: string; nullable: string }[]).map((row) => [
        row.name,
        row.nullable,
      ]),
    );
    if (!existing.size) throw new Error("Existing Lead table is required.");
    const clauses = Object.entries(DIAGNOSTIC_COLUMNS)
      .filter(([name]) => !existing.has(name))
      .map(([name, type]) => `ADD COLUMN \`${name}\` ${type}`);
    if (existing.get("email") === "NO")
      clauses.push("MODIFY COLUMN `email` VARCHAR(180) NULL");
    if (existing.get("phone") === "NO")
      clauses.push("MODIFY COLUMN `phone` VARCHAR(20) NULL");
    if (clauses.length)
      await db.query(`ALTER TABLE \`Lead\` ${clauses.join(", ")}`);
    const [indexes] = await db.query("SHOW INDEX FROM `Lead`");
    const names = new Set(
      (indexes as { Key_name: string }[]).map((i) => i.Key_name),
    );
    for (const [name, columns] of [
      ["Lead_phone_idx", "`phone`"],
      ["Lead_quizVersion_segment_idx", "`quizVersion`, `segment`"],
      ["Lead_completedAt_idx", "`completedAt`"],
    ]) {
      if (!names.has(name!))
        await db.query(`CREATE INDEX \`${name}\` ON \`Lead\` (${columns})`);
    }
    console.log("Diagnostic v2 schema ready.");
  } finally {
    await db.query("SELECT RELEASE_LOCK('travion_diagnostic_v2')");
    await db.end();
  }
}
