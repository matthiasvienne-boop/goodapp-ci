import http from "node:http";
import { fileURLToPath } from "node:url";

export function maakServer(env) {
  return http.createServer((req, res) => {
    if (req.method !== "GET") return stuur(res, 405, { fout: "alleen GET" });
    if (req.url === "/health") return stuur(res, 200, { status: "ok" });
    if (req.url === "/version") return stuur(res, 200, { commit: env.RAILWAY_GIT_COMMIT_SHA || null });
    return stuur(res, 404, { fout: "onbekende route" });
  });
}

function stuur(res, status, lichaam) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(lichaam));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const poort = process.env.PORT;
  if (!poort || !/^\d+$/.test(poort)) {
    console.error("PORT ontbreekt of is geen getal");
    process.exit(1);
  }
  maakServer(process.env).listen(Number(poort), "0.0.0.0", () => {
    console.log(`probe luistert op poort ${poort}`);
  });
}
