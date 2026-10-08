# goodapp-ci

Herbruikbare GitHub Actions voor de GoodApp-producten (PLAT-281). Publiek, zonder geheimen:
alles wat hier staat is bruikbaar voor wie de repository leest, en de aanroeper levert zijn eigen scripts.

**Status: proef.** De werkwijze is nog niet in werking voor de productrepo's. De acties verwijzen nu naar `@main`;
vóór een echte uitrol worden alle verwijzingen vastgepind op een tag of commit-SHA.

## Wat erin zit

| Onderdeel | Doel |
|---|---|
| `.github/workflows/ci.yml` | Kandidaatvalidatie: installeren, typecheck, lint, tests, build en migratiescan. Zet bij succes de status `goodapp-ci/gevalideerd` op de commit. |
| `.github/workflows/productiecontrole.yml` | Kleine controle op de branch `production`: is precies deze commit als kandidaat gevalideerd? Zo niet: rood, zodat Railway Wait for CI de deploy tegenhoudt. |
| `actions/migratiescan` | Labelt toegevoegde migratieregels: `geen-migratie`, `veilig`, `let-op`, `risicovol`. Een tekstscan op regels, geen SQL-parser: hij vervangt de menselijke goedkeuring niet. |
| `actions/ci-stappen`, `actions/markeer` | Bouwstenen voor `ci.yml`. |

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
    uses: matthiasvienne-boop/goodapp-ci/.github/workflows/ci.yml@main
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
    uses: matthiasvienne-boop/goodapp-ci/.github/workflows/productiecontrole.yml@main
```

Zo draait de zware controle **één keer per release** (op `candidate/*`), en is de run op `production` een controle van een halve minuut.
Pushes naar `main` en featurebranches starten niets.

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
