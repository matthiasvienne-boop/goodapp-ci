// Migratiescan (PLAT-281). Geen afhankelijkheden: alleen Node en git.
//
// Kijkt naar de REGELS DIE ZIJN TOEGEVOEGD in migratiebestanden tussen een basis en HEAD,
// en geeft één label: geen-migratie | veilig | let-op | risicovol.
//
// Dit is een tekstscan op regels, geen SQL-parser. Daarom meldt hij liever te veel dan te weinig
// ("let-op" voor wat mogelijk onschuldig is) en vervangt hij de menselijke goedkeuring niet.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const RISICOVOL = [
  [/\bDROP\s+(TABLE|COLUMN|SCHEMA|DATABASE|TYPE|VIEW)\b/i, "verwijdert een tabel, kolom, schema of type"],
  [/\bTRUNCATE\b/i, "maakt een tabel leeg"],
  [/\bALTER\s+TABLE\b[^;]*\bDROP\b/i, "verwijdert iets uit een tabel"],
  [/\bRENAME\s+(TO|COLUMN|TABLE)\b/i, "hernoemt iets: de vorige appversie breekt"],
  [/\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, "wijzigt het type van een kolom"],
  [/\bSET\s+NOT\s+NULL\b/i, "maakt een kolom verplicht"],
  [/\bADD\s+COLUMN\b(?=[^;]*\bNOT\s+NULL\b)(?![^;]*\bDEFAULT\b)/i, "nieuwe verplichte kolom zonder standaardwaarde"],
  [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/i, "verwijdert alle rijen (geen WHERE op deze regel)"],
];
const LET_OP = [
  [/\bDROP\s+(INDEX|CONSTRAINT|DEFAULT|TRIGGER|POLICY)\b/i, "verwijdert een index of beperking"],
  [/\bCREATE\s+(UNIQUE\s+)?INDEX\b(?![^;]*\bCONCURRENTLY\b)/i, "index zonder CONCURRENTLY kan de tabel vergrendelen"],
  [/\bALTER\s+TYPE\b[^;]*\bADD\s+VALUE\b/i, "voegt een enumwaarde toe (niet in een transactie)"],
  [/\bUPDATE\b[^;]*\bSET\b(?![^;]*\bWHERE\b)/i, "past alle rijen aan (geen WHERE op deze regel)"],
];

const isCommentaar = (t) => /^(--|\/\/|\*|\/\*)/.test(t.trim());

/** Zuivere functie, getest in test/. `diff` is de uitvoer van `git diff -U0`. */
export function classificeer(diff) {
  const toegevoegd = [];
  let bestand = "";
  for (const regel of diff.split("\n")) {
    if (regel.startsWith("+++ ")) { bestand = regel.slice(4).replace(/^b\//, ""); continue; }
    if (regel.startsWith("+") && !regel.startsWith("+++")) toegevoegd.push({ bestand, tekst: regel.slice(1) });
  }
  const inhoud = toegevoegd.filter((r) => r.tekst.trim() !== "" && !isCommentaar(r.tekst));
  if (inhoud.length === 0) return { label: "geen-migratie", bevindingen: [] };
  const bevindingen = [];
  for (const r of inhoud) {
    for (const [re, uitleg] of RISICOVOL) if (re.test(r.tekst)) bevindingen.push({ ernst: "risicovol", bestand: r.bestand, regel: r.tekst.trim().slice(0, 140), uitleg });
    for (const [re, uitleg] of LET_OP) if (re.test(r.tekst)) bevindingen.push({ ernst: "let-op", bestand: r.bestand, regel: r.tekst.trim().slice(0, 140), uitleg });
  }
  const label = bevindingen.some((b) => b.ernst === "risicovol") ? "risicovol" : bevindingen.length ? "let-op" : "veilig";
  return { label, bevindingen };
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function main() {
  const basis = process.env.BASIS_REF || "origin/production";
  const paden = (process.env.MIGRATIE_PADEN || ":(glob)**/migrations/**\n:(glob)**/migrations.ts\n:(glob)**/*.sql").split("\n").map((p) => p.trim()).filter(Boolean);
  let uitkomst;
  try {
    git(["rev-parse", "--verify", "--quiet", basis]);
  } catch {
    uitkomst = { label: "geen-basis", bevindingen: [], opmerking: `basis ${basis} bestaat niet: dit is de eerste release, er is niets om mee te vergelijken` };
  }
  if (!uitkomst) {
    const diff = git(["diff", "-U0", "--no-color", `${basis}...HEAD`, "--", ...paden]);
    uitkomst = classificeer(diff);
  }
  const regels = [`### Migratiescan: **${uitkomst.label}**`];
  if (uitkomst.opmerking) regels.push(uitkomst.opmerking);
  for (const b of uitkomst.bevindingen) regels.push(`- ${b.ernst}: \`${b.bestand}\`: ${b.uitleg}: \`${b.regel}\``);
  console.log(regels.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, regels.join("\n") + "\n");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `risico=${uitkomst.label}\n`);
  if (uitkomst.label === "risicovol" && process.env.FAAL_BIJ_RISICO === "true") process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
