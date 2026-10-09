import { test } from "node:test";
import assert from "node:assert/strict";
import { raaktAlleenDocs } from "../actions/alleen-docs/check.mjs";

test("alleen .md en docs/ is alleen documentatie", () => {
  assert.equal(raaktAlleenDocs(["README.md", "docs/a.png", "docs/sub/b.txt", "notities/uitleg.MD"]), true);
});
test("één coderegel maakt het zwaar", () => {
  assert.equal(raaktAlleenDocs(["README.md", "server/index.ts"]), false);
  assert.equal(raaktAlleenDocs(["package.json"]), false);
});
test("een workflowbestand telt niet als documentatie", () => {
  assert.equal(raaktAlleenDocs([".github/workflows/ci.yml", "docs/a.md"]), false);
});
test("geen wijzigingen is geen documentatierelease (veilig zwaar)", () => {
  assert.equal(raaktAlleenDocs([]), false);
  assert.equal(raaktAlleenDocs(["", "  "]), false);
});
test("een map die alleen op docs lijkt telt niet", () => {
  assert.equal(raaktAlleenDocs(["docsnippets/x.ts"]), false);
  assert.equal(raaktAlleenDocs(["src/docs/x.ts"]), false);
});
test("eigen patronen werken", () => {
  assert.equal(raaktAlleenDocs(["CHANGELOG", "uitleg/a.txt"], ["CHANGELOG", "uitleg/"]), true);
});
