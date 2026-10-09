import { test } from "node:test";
import assert from "node:assert/strict";
import { beslis, leesStatus } from "../scripts/release.mjs";

const goed = { modus: "uitgebreid", risico: "veilig" };

test("leesStatus begrijpt het nieuwe en het oude formaat", () => {
  assert.deepEqual(leesStatus("gevalideerd (uitgebreid), migraties: veilig"), goed);
  assert.deepEqual(leesStatus("gevalideerd (alleen-documentatie), migraties: geen-migratie"), { modus: "alleen-documentatie", risico: "geen-migratie" });
  assert.deepEqual(leesStatus("gevalideerd, migraties: geen-basis"), { modus: "uitgebreid", risico: "geen-basis" });
  assert.equal(leesStatus(""), null);
  assert.equal(leesStatus("iets anders"), null);
});

test("een gevalideerde fast-forward mag", () => {
  const b = beslis({ status: goed, isFastForward: true });
  assert.equal(b.toegestaan, true);
  assert.deepEqual(b.redenen, []);
});

test("zonder gevalideerde status wordt geweigerd", () => {
  const b = beslis({ status: null, isFastForward: true });
  assert.equal(b.toegestaan, false);
  assert.match(b.redenen[0], /niet als kandidaat gevalideerd/);
});

test("een niet-fast-forward wordt geweigerd, ook als alles gevalideerd is", () => {
  const b = beslis({ status: goed, isFastForward: false });
  assert.equal(b.toegestaan, false);
  assert.match(b.redenen.join(" "), /fast-forward/);
});

test("een eerste release (geen production) telt als fast-forward", () => {
  assert.equal(beslis({ status: goed, isFastForward: true }).toegestaan, true);
});

test("risicovol vraagt twee bevestigingen, allebei", () => {
  const risico = { modus: "uitgebreid", risico: "risicovol" };
  assert.equal(beslis({ status: risico, isFastForward: true }).redenen.length, 2);
  assert.equal(beslis({ status: risico, isFastForward: true, akkoordRisicovol: true }).toegestaan, false);
  assert.equal(beslis({ status: risico, isFastForward: true, backUpGecontroleerd: true }).toegestaan, false);
  assert.equal(beslis({ status: risico, isFastForward: true, akkoordRisicovol: true, backUpGecontroleerd: true }).toegestaan, true);
});

test("een snelle validatie telt alleen voor een hotfix", () => {
  const snel = { modus: "snel", risico: "veilig" };
  assert.equal(beslis({ status: snel, isFastForward: true }).toegestaan, false);
  assert.equal(beslis({ status: snel, isFastForward: true, hotfix: true }).toegestaan, true);
});

test("een hotfix met risicovolle migratie heeft dezelfde bevestigingen nodig", () => {
  const b = beslis({ status: { modus: "snel", risico: "risicovol" }, isFastForward: true, hotfix: true });
  assert.equal(b.toegestaan, false);
});

test("let-op en niet-gescand geven een waarschuwing maar weigeren niet", () => {
  const b = beslis({ status: { modus: "uitgebreid", risico: "let-op" }, isFastForward: true });
  assert.equal(b.toegestaan, true);
  assert.equal(b.waarschuwingen.length, 1);
});

test("alleen-documentatie is een geldige releasemodus", () => {
  assert.equal(beslis({ status: { modus: "alleen-documentatie", risico: "geen-migratie" }, isFastForward: true }).toegestaan, true);
});
