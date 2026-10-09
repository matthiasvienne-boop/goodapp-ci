import { test } from "node:test";
import assert from "node:assert/strict";
import { maakServer } from "./server.mjs";

async function metServer(env, fn) {
  const server = maakServer(env);
  await new Promise((klaar) => server.listen(0, "127.0.0.1", klaar));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((klaar) => server.close(klaar));
  }
}

test("/health geeft 200 en status ok", () =>
  metServer({}, async (basis) => {
    const antwoord = await fetch(`${basis}/health`);
    assert.equal(antwoord.status, 200);
    assert.deepEqual(await antwoord.json(), { status: "ok" });
  }));

test("/version geeft de commit-SHA uit RAILWAY_GIT_COMMIT_SHA", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  return metServer({ RAILWAY_GIT_COMMIT_SHA: sha }, async (basis) => {
    const antwoord = await fetch(`${basis}/version`);
    assert.equal(antwoord.status, 200);
    assert.deepEqual(await antwoord.json(), { commit: sha });
  });
});

test("/version meldt null als de SHA ontbreekt, zonder fallbackwaarde", () =>
  metServer({}, async (basis) => {
    const antwoord = await fetch(`${basis}/version`);
    assert.deepEqual(await antwoord.json(), { commit: null });
  }));

test("/version meldt null bij een lege SHA", () =>
  metServer({ RAILWAY_GIT_COMMIT_SHA: "" }, async (basis) => {
    const antwoord = await fetch(`${basis}/version`);
    assert.deepEqual(await antwoord.json(), { commit: null });
  }));

test("onbekende route geeft 404", () =>
  metServer({}, async (basis) => {
    const antwoord = await fetch(`${basis}/niet-er`);
    assert.equal(antwoord.status, 404);
  }));

test("niet-GET-verzoeken geven 405", () =>
  metServer({}, async (basis) => {
    const antwoord = await fetch(`${basis}/health`, { method: "POST" });
    assert.equal(antwoord.status, 405);
  }));
