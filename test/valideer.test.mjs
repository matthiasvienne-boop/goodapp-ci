import { test } from "node:test";
import assert from "node:assert/strict";
import { valideer } from "../scripts/valideer.mjs";

const SHA = "a".repeat(40);
const basis = { gevraagdeSha: SHA, sha: SHA, basis: "origin/production", basisBestaat: true };

test("een volledige, bestaande SHA met veilige migraties is klaar", () => {
  const r = valideer({ ...basis, bestanden: ["server/index.ts"] });
  assert.equal(r.shaGeldig, true);
  assert.equal(r.oordeel, "klaar");
  assert.deepEqual(r.redenen, []);
});

test("een korte of onbekende SHA is afgekeurd", () => {
  assert.equal(valideer({ ...basis, gevraagdeSha: "a1b2c3d", sha: SHA }).oordeel, "afgekeurd");
  assert.equal(valideer({ ...basis, gevraagdeSha: SHA, sha: "" }).shaGeldig, false);
});

test("een risicovolle migratie vraagt goedkeuring, geen stille doorgang", () => {
  const migratieDiff = "+++ b/db/migrations/0002.sql\n+DROP TABLE oude_tabel;\n";
  const r = valideer({ ...basis, migratieDiff, bestanden: ["db/migrations/0002.sql"] });
  assert.equal(r.migraties.label, "risicovol");
  assert.equal(r.oordeel, "vereist-goedkeuring");
});

test("een migratie die let-op geeft is niet klaar", () => {
  const migratieDiff = "+++ b/db/migrations/0003.sql\n+CREATE INDEX idx ON t (a);\n";
  const r = valideer({ ...basis, migratieDiff, bestanden: ["db/migrations/0003.sql"] });
  assert.equal(r.migraties.label, "let-op");
  assert.equal(r.oordeel, "let-op");
});

test("zonder basis worden migraties niet vergeleken en is het let-op", () => {
  const r = valideer({ ...basis, basisBestaat: false, bestanden: ["README.md"] });
  assert.equal(r.migraties.label, "geen-basis");
  assert.equal(r.alleenDocs, false);
  assert.equal(r.oordeel, "let-op");
});

test("een testbestand met only-marker maakt het let-op", () => {
  const testDiff = "+++ b/src/login.test.ts\n+  it.only('werkt', () => {});\n";
  const r = valideer({ ...basis, testDiff, bestanden: ["src/login.test.ts"] });
  assert.equal(r.tests.markers.length, 1);
  assert.equal(r.oordeel, "let-op");
});

test("een skip-marker in een niet-testbestand telt niet als testmarker", () => {
  const testDiff = "+++ b/src/app.ts\n+// it.skip('oud')\n";
  const r = valideer({ ...basis, testDiff, bestanden: ["src/app.ts"] });
  assert.deepEqual(r.tests.markers, []);
});

test("gewijzigde testbestanden worden genoemd", () => {
  const r = valideer({ ...basis, bestanden: ["src/a.test.ts", "src/b.ts", "test/c.mjs"] });
  assert.deepEqual(r.tests.gewijzigd, ["src/a.test.ts", "test/c.mjs"]);
});

test("alleen documentatie wordt herkend als snelle modus", () => {
  const r = valideer({ ...basis, bestanden: ["README.md", "docs/a.md"] });
  assert.equal(r.alleenDocs, true);
});
