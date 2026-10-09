# goodapp-ci

Herbruikbare GitHub Actions voor de GoodApp-producten (PLAT-281). Publiek, zonder geheimen:
alles wat hier staat is bruikbaar voor wie de repository leest, en de aanroeper levert zijn eigen scripts.

**Status: proef.** De werkwijze is nog niet in werking voor de productrepo's. Aanroepers pinnen op een volledige commit-SHA van deze repo, nooit op `@main`.
`ci.yml` verwijst zelf naar de acties op een vaste SHA (zie dat bestand).

## Wat erin zit

| Onderdeel | Doel |
|---|---|
| `.github/workflows/ci.yml` | Kandidaatvalidatie: installeren, typecheck, lint, tests, build en migratiescan. Zet bij succes de status `goodapp-ci/gevalideerd` op de commit. |
| `.github/workflows/productiecontrole.yml` | Kleine controle op de branch `production`: is precies deze commit als kandidaat gevalideerd? Zo niet: rood, zodat Railway Wait for CI de deploy tegenhoudt. |
| `actions/migratiescan` | Labelt toegevoegde migratieregels: `geen-migratie`, `veilig`, `let-op`, `risicovol`. Een tekstscan op regels, geen SQL-parser: hij vervangt de menselijke goedkeuring niet. |
| `actions/alleen-docs` | Raakt de release alleen documentatie (`*.md`, `docs/`)? Dan draait `ci.yml` de zware stappen niet, maar markeert de commit wel als gevalideerd (modus `alleen-documentatie`). Bij twijfel of zonder basis: zwaar valideren. |
| `scripts/release.mjs` | Promoveert een gevalideerde kandidaat naar `production`. Weigert vóór het pushen; pusht alleen met `--ga`. Zie hieronder. |
| `actions/ci-stappen`, `actions/markeer` | Bouwstenen voor `ci.yml`. `ci-stappen` kent ook `migratie-command` (draait na de installatie, vóór de controles). |

## Hoe een app het gebruikt

`.github/workflows/ci.yml` in de app:

```yaml
name: ci
on:
  push:
    branches: ["candidate/**"]
  workflow_dispatch:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  kandidaat:
    permissions: { contents: read, statuses: write }
    uses: matthiasvienne-boop/goodapp-ci/.github/workflows/ci.yml@<volledige-commit-sha>
    with:
      typecheck-command: npm run typecheck
      test-command: npm test
      build-command: npm run build
```

en `.github/workflows/productie.yml`:

```yaml
name: productie
on:
  push:
    branches: [production]
permissions:
  contents: read
  statuses: read
jobs:
  controle:
    uses: matthiasvienne-boop/goodapp-ci/.github/workflows/productiecontrole.yml@<volledige-commit-sha>
```

Zo draait de zware controle **één keer per release** (op `candidate/*`), en is de run op `production` een controle van een halve minuut.
Pushes naar `main` en featurebranches starten niets.

## Voor de aanroeper: nooit een filter op de productiecontrole

`productie.yml` (de aanroep van `productiecontrole.yml`) mag **geen** `paths`, `paths-ignore` of ander filter hebben. Bewezen in de proef (PLAT-283):
draait er voor een push naar `production` geen workflow, dan rolt Railway Wait for CI de commit na ongeveer 45 seconden **ongecontroleerd uit**, ook
de niet-gevalideerde commits die eronder staan. De controle duurt een halve minuut; filteren hoort binnen de zware kandidaatrun te gebeuren
(`alleen-docs`), niet door de controle over te slaan.

## Releasescript

```
node scripts/release.mjs                 # droogloop: toont wat er zou gebeuren
node scripts/release.mjs --ga            # pusht de gevalideerde kandidaat naar production
node scripts/release.mjs --akkoord-risicovol --back-up-gecontroleerd --ga   # bij migratielabel risicovol
node scripts/release.mjs --hotfix --ga   # alleen met een (snelle) gevalideerde commit
```

Het script weigert als de commit niet als kandidaat gevalideerd is, als de validatie alleen "snel" was zonder `--hotfix`, als de commit geen
fast-forward van `production` is, of als de migraties `risicovol` zijn zonder beide bevestigingen. Het forceert nooit. De reden voor de
volgorde: de branch `production` beweegt ook als de controle daarna faalt; de slechte commit blijft er dan op staan terwijl Railway de deploy overslaat.

## Uitgangspunten

- Alleen gratis functionaliteit: Linux-runners, publieke repository, geen betaalde diensten.
- Minimale rechten (`contents: read`; `statuses: write` alleen bij het markeren van een kandidaat).
- Geen productiegeheimen. Databasetests draaien tegen een wegwerp-Postgres in de run zelf (`postgres: true`), met databanknaam `test`.
- Acties van derden staan vastgepind op een commit-SHA.
- Geen app-specifieke logica: de scripts van de app komen uit de aanroeper.

## Migratiescan: wat hij wel en niet is

Hij leest de regels die tussen `production` en de kandidaat zijn toegevoegd in `**/migrations/**`, `**/migrations.ts` en `**/*.sql`.
`risicovol` betekent: een expliciete goedkeuring is nodig en een back-up van de laatste 24 uur. Het patroon-voor-patroon staat in
`actions/migratiescan/scan.mjs`, met tests in `test/`. Expand-and-contract blijft de regel: eerst toevoegen, de code beide laten
aankunnen, en pas in een latere release verwijderen.

## Testen

`npm test` (alleen Node, geen afhankelijkheden). Draait ook bij elke push naar `main` via `.github/workflows/zelftest.yml`.
