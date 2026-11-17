import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

const require = createRequire(import.meta.url);
const routes = [
  "api/cron/index-github",
  "api/cron/rebalance-bps",
  "api/webhooks/github",
];

for (const route of routes) {
  const trace = resolve(".next/server/app", route, "route.js.nft.json");
  const { files } = JSON.parse(readFileSync(trace, "utf8"));
  const paths = files.map((file) => resolve(dirname(trace), file));
  const oidc = paths.find((path) =>
    path.includes(`${sep}@vercel${sep}queue${sep}node_modules${sep}@vercel${sep}oidc${sep}dist${sep}index.js`),
  );
  if (!oidc) throw new Error(`${route}: Vercel Queue OIDC is absent from the output trace`);

  const traced = new Set(paths.map((path) => realpathSync(path)));
  const oidcRequire = createRequire(oidc);
  const joseEntry = realpathSync(oidcRequire.resolve("jose"));
  oidcRequire("jose");
  const joseRoot = `${sep}node_modules${sep}jose${sep}`;
  const joseFiles = Object.keys(require.cache).filter((path) => path.includes(joseRoot));
  if (!traced.has(joseEntry) || joseFiles.length === 0 || joseFiles.some((path) => !traced.has(realpathSync(path)))) {
    throw new Error(`${route}: Vercel Queue's jose runtime files are missing from the output trace`);
  }
}

console.log("Workflow OIDC runtime dependencies are present in all affected route traces.");
