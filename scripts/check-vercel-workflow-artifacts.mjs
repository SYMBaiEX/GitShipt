import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Run after `vercel build --standalone`; copies prevent fallback to workspace modules.
const output = resolve(process.argv[2] ?? ".vercel/output");
const functions = [
  "api/cron/index-github.func",
  "api/cron/rebalance-bps.func",
  "api/webhooks/github.func",
  ".well-known/workflow/v1/flow.func",
];
const oidcPath = "node_modules/@vercel/queue/node_modules/@vercel/oidc";
const probe = `
  const { createRequire } = require("node:module");
  const path = require("node:path");
  const r = createRequire(path.join(process.cwd(), ${JSON.stringify(oidcPath)}, "dist/index.js"));
  const jose = r.resolve("jose");
  if (!jose.startsWith(process.cwd() + path.sep)) throw Error("jose resolved outside function");
  r(${JSON.stringify("@vercel/oidc")});
  console.log(jose);
`;
const root = mkdtempSync(join(tmpdir(), "gitshipt-vercel-check-"));
try {
  for (const [index, name] of functions.entries()) {
    const destination = join(root, String(index));
    cpSync(realpathSync(join(output, "functions", name)), destination, { recursive: true });
    const run = () => spawnSync("bun", ["-e", probe], {
      cwd: destination,
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: "" },
    });
    let result = run();
    if (result.status !== 0) throw new Error(`${name}: Bun cannot import packaged OIDC and jose: ${result.stderr}`);

    // Force a nested package even when the install happens to hoist jose.
    const oidc = join(destination, oidcPath);
    const nested = join(oidc, "node_modules/jose");
    const source = result.stdout.trim().split("/dist/")[0];
    if (!source) throw new Error(`${name}: cannot locate packaged jose`);
    if (!existsSync(nested) || realpathSync(source) !== realpathSync(nested)) {
      mkdirSync(dirname(nested), { recursive: true });
      cpSync(source, nested, { recursive: true });
    }
    const browser = join(nested, "dist/browser");
    const hidden = join(nested, "dist/browser.hidden");
    renameSync(browser, hidden);
    result = run();
    renameSync(hidden, browser);
    if (result.status === 0 || !/Cannot find (?:module|package) 'jose'/.test(result.stderr)) {
      throw new Error(`${name}: nested jose negative control did not reproduce the missing-module failure: ${result.stderr}`);
    }
    result = run();
    if (result.status !== 0 || !result.stdout.includes(`${oidcPath}/node_modules/jose/dist/browser/`)) {
      throw new Error(`${name}: Bun cannot import nested jose browser files: ${result.stderr}`);
    }
  }
  console.log("Copied Vercel workflow functions pass Bun OIDC resolution and nested-shadow regression checks.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
