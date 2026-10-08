import { test } from "node:test";
import assert from "node:assert/strict";
import { classificeer } from "../actions/migratiescan/scan.mjs";

// Een mini-diff zoals `git diff -U0` hem geeft: alleen de toegevoegde regels tellen.
const diff = (bestand, ...regels) => `diff --git a/${bestand} b/${bestand}\n--- a/${bestand}\n+++ b/${bestand}\n@@ -0,0 +1 @@\n${regels.map((r) => "+" + r).join("\n")}\n`;

test("zonder toegevoegde migratieregels is het label geen-migratie", () => {
  assert.equal(classificeer("").label, "geen-migratie");
  assert.equal(classificeer(diff("db/migrations/1.sql", "", "-- alleen een opmerking: DROP TABLE x")).label, "geen-migratie");
});

test("een onschuldige migratie is veilig", () => {
  const u = classificeer(diff("db/migrations/2.sql", "CREATE TABLE klant (id uuid PRIMARY KEY);", "ALTER TABLE klant ADD COLUMN naam text;"));
  assert.equal(u.label, "veilig");
});

test("DROP COLUMN en DROP TABLE zijn risicovol", () => {
  assert.equal(classificeer(diff("prisma/migrations/3/migration.sql", "ALTER TABLE klant DROP COLUMN naam;")).label, "risicovol");
  assert.equal(classificeer(diff("prisma/migrations/3/migration.sql", "DROP TABLE klant;")).label, "risicovol");
});

test("een bewust destructieve testmigratie wordt als risicovol gemeld, met bestand en uitleg", () => {
  const u = classificeer(diff("fixtures/migrations/9_destructief.sql", "TRUNCATE TABLE betaling;"));
  assert.equal(u.label, "risicovol");
  assert.equal(u.bevindingen[0].bestand, "fixtures/migrations/9_destructief.sql");
  assert.match(u.bevindingen[0].uitleg, /leeg/);
});

test("een verplichte kolom is alleen veilig met een standaardwaarde", () => {
  assert.equal(classificeer(diff("m/1.sql", "ALTER TABLE t ADD COLUMN x int NOT NULL;")).label, "risicovol");
  assert.equal(classificeer(diff("m/1.sql", "ALTER TABLE t ADD COLUMN x int NOT NULL DEFAULT 0;")).label, "veilig");
});

test("hernoemen, type wijzigen en NOT NULL zetten zijn risicovol", () => {
  for (const sql of ["ALTER TABLE t RENAME COLUMN a TO b;", "ALTER TABLE t ALTER COLUMN a TYPE bigint;", "ALTER TABLE t ALTER COLUMN a SET NOT NULL;"]) {
    assert.equal(classificeer(diff("m/1.sql", sql)).label, "risicovol", sql);
  }
});

test("een index zonder CONCURRENTLY en DROP INDEX zijn let-op, niet risicovol", () => {
  assert.equal(classificeer(diff("m/1.sql", "CREATE INDEX i ON t (a);")).label, "let-op");
  assert.equal(classificeer(diff("m/1.sql", "CREATE INDEX CONCURRENTLY i ON t (a);")).label, "veilig");
  assert.equal(classificeer(diff("m/1.sql", "DROP INDEX i;")).label, "let-op");
});

test("SQL in een TypeScript-migratielijst wordt ook gelezen (Brickstory-vorm)", () => {
  const u = classificeer(diff("server/migrations.ts", "      ALTER TABLE sets DROP COLUMN oud;"));
  assert.equal(u.label, "risicovol");
});

test("verwijderde regels tellen niet mee", () => {
  const d = "diff --git a/m/1.sql b/m/1.sql\n--- a/m/1.sql\n+++ b/m/1.sql\n@@ -1 +0,0 @@\n-DROP TABLE klant;\n";
  assert.equal(classificeer(d).label, "geen-migratie");
});

test("DELETE zonder WHERE is risicovol, met WHERE niet", () => {
  assert.equal(classificeer(diff("m/1.sql", "DELETE FROM sessie;")).label, "risicovol");
  assert.equal(classificeer(diff("m/1.sql", "DELETE FROM sessie WHERE oud;")).label, "veilig");
});
