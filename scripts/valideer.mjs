#!/usr/bin/env node
// Centrale validatie van één kandidaat-commit (PLAT-281, fase 1). Geen afhankelijkheden: alleen Node en git.
//
// Valideert een exacte commit-SHA op drie punten die de releasebeslissing voeden:
//   - de SHA is volledig en bestaat als commit,
//   - het migratierisico ten opzichte van de basis (hergebruikt actions/migratiescan),
//   - de gewijzigde testbestanden en of er skip- of only-markers zijn toegevoegd.
// Het resultaat is een JSON-bestand dat Founder OS later kan lezen. Dit script pusht niets en zet geen status.
//
//   node scripts/valideer.mjs --sha <volledige-sha> [--basis origin/production] [--uit validatie.json]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { classificeer } from "../actions/migratiescan/scan.mjs";
import { raaktAlleenDocs } from "../actions/alleen-docs/check.mjs";

export const SCHEMA = "goodapp-ci/validatie@1";
const MIGRATIE_PADEN = [":(glob)**/migrations/**", ":(glob)**/migrations.ts", ":(glob)**/*.sql"];
const TEST_BESTAND = [/\.(test|spec)\.[cm]?[jt]sx?$/, /(^|\/)(test|tests|__tests__)\//];
const MARKERS = [
  [/\b(describe|it|test)\.only\s*\(/, "only-marker: alleen deze test draait"],
  [/\b(describe|it|test)\.skip\s*\(/, "skip-marker: deze test wordt overgeslagen"],
  [/\b(fdescribe|fit)\s*\(/, "focus-marker: alleen deze test draait"],
  [/\b(xdescribe|xit|xtest)\s*\(/, "skip-marker: deze test wordt overgeslagen"],
];

/** Regels die `git diff -U0` toevoegt, per bestand. */
function toegevoegd(diff) {
  const regels = [];
  let bestand = "";
  for (const regel of diff.split("\n")) {
    if (regel.startsWith("+++ ")) { bestand = regel.slice(4).replace(/^b\//, ""); continue; }
    if (regel.startsWith("+") && !regel.startsWith("+++")) regels.push({ bestand, tekst: regel.slice(1) });
  }
  return regels;
}

/** Zuivere beoordeling. Invoer: resultaten van de git-laag, geen git-aanroepen hier. */
export function valideer({ gevraagdeSha, sha, basis, basisBestaat, migratieDiff = "", testDiff = "", bestanden = [], docsPatronen = ["*.md", "docs/"] }) {
  const redenen = [];
  const shaGeldig = /^[0-9a-f]{40}$/.test(gevraagdeSha ?? "") && sha === gevraagdeSha;
  if (!shaGeldig) redenen.push("De SHA is niet een volledige commit-SHA die bestaat: gebruik de 40 tekens van de exacte commit.");

  const migraties = basisBestaat
    ? classificeer(migratieDiff)
    : { label: "geen-basis", bevindingen: [], opmerking: `basis ${basis} bestaat niet: eerste release, niets om mee te vergelijken` };

  const gewijzigdeTests = bestanden.filter((f) => TEST_BESTAND.some((re) => re.test(f)));
  const markers = [];
  for (const r of toegevoegd(testDiff)) {
    if (!TEST_BESTAND.some((re) => re.test(r.bestand))) continue;
    for (const [re, uitleg] of MARKERS) if (re.test(r.tekst)) markers.push({ bestand: r.bestand, regel: r.tekst.trim().slice(0, 140), uitleg });
  }

  const alleenDocs = basisBestaat && raaktAlleenDocs(bestanden, docsPatronen);

  let oordeel = "klaar";
  if (!shaGeldig) oordeel = "afgekeurd";
  else if (migraties.label === "risicovol") oordeel = "vereist-goedkeuring";
  else if (migraties.label === "let-op" || migraties.label === "geen-basis" || markers.length > 0) oordeel = "let-op";
  if (migraties.label === "risicovol") redenen.push("Migraties zijn risicovol: expliciete goedkeuring en een back-up van de laatste 24 uur zijn nodig.");
  if (migraties.label === "let-op") redenen.push("Migratiescan geeft let-op: lees de bevindingen voordat je promoveert.");
  if (migraties.label === "geen-basis") redenen.push(`Basis ${basis} bestaat niet: migraties zijn niet vergeleken.`);
  if (markers.length > 0) redenen.push("Er zijn skip- of only-markers in testbestanden toegevoegd: die verbergen tests.");

  return {
    schema: SCHEMA,
    gevraagdeSha,
    sha,
    shaGeldig,
    basis,
    basisBestaat,
    alleenDocs,
    migraties,
    tests: { gewijzigd: gewijzigdeTests, markers },
    oordeel,
    redenen,
  };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function vlaggen(argv) {
  const v = { sha: null, basis: process.env.BASIS_REF || "origin/production", uit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sha") v.sha = argv[++i];
    else if (a === "--basis") v.basis = argv[++i];
    else if (a === "--uit") v.uit = argv[++i];
    else throw new Error(`Onbekende optie: ${a}`);
  }
  if (!v.sha) throw new Error("--sha is verplicht (de volledige commit-SHA)");
  return v;
}

function main() {
  const v = vlaggen(process.argv.slice(2));
  let sha = "";
  try {
    sha = git(["rev-parse", "--verify", `${v.sha}^{commit}`]).trim();
  } catch {
    sha = "";
  }
  const basisBestaat = (() => {
    try { git(["rev-parse", "--verify", "--quiet", v.basis]); return true; } catch { return false; }
  })();
  const bereik = basisBestaat && sha ? `${v.basis}...${sha}` : null;
  const bestanden = bereik ? git(["diff", "--name-only", bereik]).split("\n").filter(Boolean) : [];
  const migratieDiff = bereik ? git(["diff", "-U0", "--no-color", bereik, "--", ...MIGRATIE_PADEN]) : "";
  const testDiff = bereik ? git(["diff", "-U0", "--no-color", bereik]) : "";

  const resultaat = valideer({ gevraagdeSha: v.sha, sha, basis: v.basis, basisBestaat, migratieDiff, testDiff, bestanden });
  const json = JSON.stringify(resultaat, null, 2) + "\n";
  if (v.uit) writeFileSync(v.uit, json);
  console.log(json);
  if (resultaat.oordeel === "afgekeurd") process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
