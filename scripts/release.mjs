#!/usr/bin/env node
// Promoveert een gevalideerde kandidaat naar de branch production (PLAT-285).
//
// De les uit de proef (PLAT-283): de branch production beweegt ook als de controle daarna faalt. De slechte
// commit blijft er dan op staan terwijl Railway de deploy overslaat. Daarom weigert dit script VÓÓR het
// pushen, en pusht het nooit zonder --ga.
//
//   node scripts/release.mjs [--repo eigenaar/naam] [--sha <sha>] [--hotfix]
//        [--akkoord-risicovol --back-up-gecontroleerd] [--ga]
//
// Zonder --ga is het een droogloop: het toont wat het zou doen. Geen afhankelijkheden, alleen Node, git en gh.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Haalt modus en migratielabel uit de status "gevalideerd (modus), migraties: label". */
export function leesStatus(beschrijving) {
  if (!beschrijving) return null;
  const m = /^gevalideerd(?: \(([^)]+)\))?, migraties: (\S+)/.exec(beschrijving.trim());
  if (!m) return null;
  return { modus: m[1] ?? "uitgebreid", risico: m[2] };
}

/**
 * Zuivere beslissing. Geeft { toegestaan, redenen[], waarschuwingen[] }.
 * Elke reden is een weigering; zonder redenen mag er gepromoveerd worden.
 */
export function beslis({ status, isFastForward, hotfix = false, akkoordRisicovol = false, backUpGecontroleerd = false }) {
  const redenen = [];
  const waarschuwingen = [];
  if (!status) {
    redenen.push("Deze commit is niet als kandidaat gevalideerd (status goodapp-ci/gevalideerd ontbreekt). Laat eerst de kandidaatrun slagen.");
  } else {
    if (status.modus === "snel" && !hotfix) redenen.push("Alleen een snelle validatie: die telt uitsluitend voor een hotfix (--hotfix). Voor een gewone release is een uitgebreide kandidaatrun nodig.");
    if (status.risico === "risicovol") {
      if (!akkoordRisicovol) redenen.push("Migraties zijn risicovol: expliciete goedkeuring ontbreekt (--akkoord-risicovol).");
      if (!backUpGecontroleerd) redenen.push("Migraties zijn risicovol: bevestig dat er een back-upbestand van de laatste 24 uur in de bucket staat (--back-up-gecontroleerd).");
    }
    if (status.risico === "let-op") waarschuwingen.push("Migratiescan geeft 'let-op': lees de bevindingen in de kandidaatrun voordat je doorgaat.");
    if (status.risico === "niet-gescand") waarschuwingen.push("De migraties zijn bij deze kandidaat niet gescand.");
  }
  if (isFastForward === false) redenen.push("De commit is geen directe opvolger van production (geen fast-forward). Rebase of maak een nieuwe kandidaat; forceren doet dit script nooit.");
  return { toegestaan: redenen.length === 0, redenen, waarschuwingen };
}

function uitvoeren(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

function vlaggen(argv) {
  const v = { ga: false, hotfix: false, akkoordRisicovol: false, backUpGecontroleerd: false, repo: null, sha: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ga") v.ga = true;
    else if (a === "--hotfix") v.hotfix = true;
    else if (a === "--akkoord-risicovol") v.akkoordRisicovol = true;
    else if (a === "--back-up-gecontroleerd") v.backUpGecontroleerd = true;
    else if (a === "--repo") v.repo = argv[++i];
    else if (a === "--sha") v.sha = argv[++i];
    else throw new Error(`Onbekende optie: ${a}`);
  }
  return v;
}

function main() {
  const v = vlaggen(process.argv.slice(2));
  uitvoeren("git", ["fetch", "-q", "origin"]);
  const repo = v.repo ?? uitvoeren("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  const sha = uitvoeren("git", ["rev-parse", v.sha ?? "origin/main"]);

  let beschrijving = "";
  try {
    beschrijving = uitvoeren("gh", ["api", `repos/${repo}/commits/${sha}/statuses`, "--jq", '[.[] | select(.context=="goodapp-ci/gevalideerd" and .state=="success")][0].description // ""']);
  } catch (e) {
    console.error("Kon de status niet lezen:", String(e.message).split("\n")[0]);
    process.exit(2);
  }
  let isFastForward = true;
  let productieSha = null;
  try {
    productieSha = uitvoeren("git", ["rev-parse", "--verify", "-q", "origin/production"]);
    try { uitvoeren("git", ["merge-base", "--is-ancestor", productieSha, sha]); } catch { isFastForward = false; }
  } catch { /* geen production: eerste release */ }

  const besluit = beslis({ status: leesStatus(beschrijving), isFastForward, hotfix: v.hotfix, akkoordRisicovol: v.akkoordRisicovol, backUpGecontroleerd: v.backUpGecontroleerd });
  console.log(`Repo: ${repo}\nKandidaat: ${sha.slice(0, 7)}\nProduction nu: ${productieSha ? productieSha.slice(0, 7) : "bestaat nog niet (eerste release)"}\nStatus: ${beschrijving || "geen"}`);
  for (const w of besluit.waarschuwingen) console.log(`LET OP: ${w}`);
  if (!besluit.toegestaan) {
    for (const r of besluit.redenen) console.error(`GEWEIGERD: ${r}`);
    process.exit(1);
  }
  if (!v.ga) {
    console.log(`DROOGLOOP: ${sha.slice(0, 7)} zou naar production gaan. Voeg --ga toe om echt te pushen.`);
    return;
  }
  uitvoeren("git", ["push", "origin", `${sha}:refs/heads/production`]);
  console.log(`Gepromoveerd: ${sha.slice(0, 7)} staat op production. Controleer nu de deploylijst: SUCCESS na deze tijd is het bewijs.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
