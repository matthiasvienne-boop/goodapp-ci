// Raakt deze release alleen documentatie? (PLAT-285). Geen afhankelijkheden: alleen Node en git.
//
// Dan hoeven de zware stappen niet te draaien, maar moet de commit wel als gevalideerd gemarkeerd
// worden: de productiecontrole eist dat voor élke commit op production (anders rolt Railway ongecontroleerd uit).
// Bij twijfel is het antwoord "nee": zwaar valideren is veilig, een docs-label ten onrechte is dat niet.
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Een patroon eindigend op "/" is een map in de wortel; "*.ext" is een extensie op elke diepte. */
export function raaktAlleenDocs(bestanden, patronen = ["*.md", "docs/"]) {
  const lijst = bestanden.map((b) => b.trim()).filter(Boolean);
  if (lijst.length === 0) return false;
  return lijst.every((f) =>
    patronen.some((p) => (p.startsWith("*.") ? f.toLowerCase().endsWith(p.slice(1).toLowerCase()) : p.endsWith("/") ? f.startsWith(p) : f === p)),
  );
}

function main() {
  const basis = process.env.BASIS_REF || "origin/production";
  const patronen = (process.env.DOCS_PATRONEN || "*.md docs/").split(/\s+/).filter(Boolean);
  let uit = "false";
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", basis], { stdio: "ignore" });
    const namen = execFileSync("git", ["diff", "--name-only", `${basis}...HEAD`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\n");
    uit = raaktAlleenDocs(namen, patronen) ? "true" : "false";
  } catch {
    uit = "false"; // geen basis of een fout: zwaar valideren
  }
  console.log(`alleen-docs: ${uit}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `alleen-docs=${uit}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
