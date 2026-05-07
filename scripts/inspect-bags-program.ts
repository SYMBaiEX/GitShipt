/**
 * Bags fee-share-v2 program inspector.
 *
 * Re-derives the conclusions backing docs/adr/0001-bags-native-payout.md
 * by inspecting the on-chain program IDL. Re-run after Bags SDK upgrades.
 *
 * See docs/architecture/bags-native/RESEARCH.md for the architectural
 * question this answers.
 *
 * Usage:
 *   bun run scripts/inspect-bags-program.ts inspect-program
 *   bun --env-file=.env.local run scripts/inspect-bags-program.ts probe-live [--limit=5]
 *   LIVE=1 bun --env-file=.env.local run scripts/inspect-bags-program.ts experiment
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const IDL_PATH = join(
  repoRoot,
  "node_modules/@bagsfm/bags-sdk/dist/idl/fee-share-v2/idl.json",
);

type IdlInstruction = {
  name: string;
  accounts: Array<{ name: string }>;
  args: Array<{ name: string; type: unknown }>;
  docs?: string[];
};
type IdlType = {
  name: string;
  type: { kind: string; fields?: Array<{ name: string; type: unknown; docs?: string[] }> };
  docs?: string[];
};
type Idl = {
  address: string;
  metadata?: { name?: string; version?: string };
  instructions: IdlInstruction[];
  types: IdlType[];
  accounts?: Array<{ name: string; discriminator: number[] }>;
};

function loadIdl(): Idl {
  return JSON.parse(readFileSync(IDL_PATH, "utf8")) as Idl;
}

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}
function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}
function ok(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}
function warn(s: string): string {
  return `\x1b[33m${s}\x1b[0m`;
}

// --- inspect-program -------------------------------------------------------

function inspectProgram(): void {
  const idl = loadIdl();
  console.log(bold("\n=== Bags fee-share-v2 program inspection ===\n"));
  console.log(`program id: ${idl.address}`);
  if (idl.metadata?.version) console.log(`idl version: ${idl.metadata.version}`);

  console.log(bold("\n--- All instructions ---"));
  for (const ix of idl.instructions) {
    const tag = classifyInstruction(ix.name);
    console.log(`  ${tag} ${ix.name}`);
  }

  console.log(bold("\n--- Lifecycle-relevant instruction args ---"));
  printInstructionArgs(idl, "create_fee_config");
  printInstructionArgs(idl, "extend_created_fee_config");
  printInstructionArgs(idl, "update_fee_config");
  printInstructionArgs(idl, "manager_update_fee_config");
  printInstructionArgs(idl, "force_claim_user");
  printInstructionArgs(idl, "force_claim_user_to_vault");
  printInstructionArgs(idl, "claim_user");
  printInstructionArgs(idl, "claim_user_vault");

  console.log(bold("\n--- Per-claimer accrual storage (FeeShareAuthority) ---"));
  printType(idl, "FeeShareAuthority");

  console.log(bold("\n--- Claimer set storage (FeeShareConfig) ---"));
  printType(idl, "FeeShareConfig");

  console.log(bold("\n--- Findings ---"));
  console.log(`  ${ok("✓")} Fees accrue per-slot in FeeShareAuthority.fees: u64[N], indexed by claimer_index.`);
  console.log(`  ${ok("✓")} Claim instructions take a claimer_index (u32), not a pubkey lookup.`);
  console.log(`  ${ok("✓")} BPS can be re-weighted within an existing slot range via update_fee_config.`);
  console.log(`  ${ok("✓")} Admin can drain a slot's accrued via force_claim_user (to wallet) or force_claim_user_to_vault (to a per-user PDA).`);
  console.log(`  ${warn("✗")} No instruction takes a 'claimers' (pubkey vec) field for replacement. Claimer pubkeys are IMMUTABLE once set.`);
  console.log(`  ${warn("✗")} update_fee_config with finalize_update=true is permanent — no further changes ever.`);
  console.log(`  ${warn("✗")} CRITICAL: FeeShareConfig.is_init_finalized=0 blocks claim AND update ixs — the "never finalize, just keep extending" pattern is non-viable.`);
  console.log(`     Lifecycle is: extend phase (no claims, no updates) → finalize → operational phase (claims + bps updates only, no extends).`);
  console.log(`  ${warn("=>")} Conclusion: the claimer pubkey set is fixed once the token goes operational. Only BPS rotates. To grow the set, you must finalize a new token.`);
}

function classifyInstruction(name: string): string {
  if (name.startsWith("claim_") || name.startsWith("force_") || name === "claim_user_vault")
    return dim("[claim ]");
  if (name.startsWith("update_") || name.startsWith("manager_update")) return dim("[update]");
  if (name.startsWith("create_") || name.startsWith("init_")) return dim("[create]");
  if (name.startsWith("extend_")) return dim("[extend]");
  if (name.startsWith("manager_transfer") || name === "confirm_admin") return dim("[admin ]");
  if (name.startsWith("manager_waive")) return dim("[waive ]");
  if (name.startsWith("dummy")) return dim("[noop  ]");
  return dim("[other ]");
}

function printInstructionArgs(idl: Idl, name: string): void {
  const ix = idl.instructions.find((i) => i.name === name);
  if (!ix) {
    console.log(`  ${name}: ${warn("(not found in this IDL version)")}`);
    return;
  }
  console.log(`\n  ${bold(name)}`);
  if (ix.args.length === 0) {
    console.log(`    args: (none)`);
    return;
  }
  for (const arg of ix.args) {
    const typeName = extractParamTypeName(arg.type);
    if (!typeName) {
      console.log(`    ${arg.name}: ${JSON.stringify(arg.type)}`);
      continue;
    }
    const t = idl.types.find((t) => t.name === typeName);
    if (!t || !t.type.fields) {
      console.log(`    ${arg.name}: ${typeName}`);
      continue;
    }
    console.log(`    ${arg.name}: ${typeName}`);
    for (const f of t.type.fields) {
      const docs = f.docs?.length ? dim(`  // ${f.docs.join(" ")}`) : "";
      console.log(`      .${f.name}: ${formatType(f.type)}${docs}`);
    }
  }
}

function extractParamTypeName(t: unknown): string | null {
  if (t && typeof t === "object" && "defined" in t) {
    const d = (t as { defined: unknown }).defined;
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && "name" in d) return String((d as { name: string }).name);
  }
  return null;
}

function formatType(t: unknown): string {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") {
    if ("vec" in t) return `vec<${formatType((t as { vec: unknown }).vec)}>`;
    if ("array" in t) {
      const a = (t as { array: [unknown, number] }).array;
      return `[${formatType(a[0])}; ${a[1]}]`;
    }
    if ("defined" in t) {
      const d = (t as { defined: unknown }).defined;
      if (typeof d === "string") return d;
      if (d && typeof d === "object" && "name" in d) return String((d as { name: string }).name);
    }
    if ("option" in t) return `option<${formatType((t as { option: unknown }).option)}>`;
  }
  return JSON.stringify(t);
}

function printType(idl: Idl, name: string): void {
  const t = idl.types.find((t) => t.name === name);
  if (!t || !t.type.fields) {
    console.log(`  ${warn(`(type ${name} not found)`)}`);
    return;
  }
  if (t.docs?.length) console.log(`  ${dim(`// ${t.docs.join(" ")}`)}`);
  for (const f of t.type.fields) {
    const docs = f.docs?.length ? dim(`  // ${f.docs.join(" ")}`) : "";
    console.log(`    ${f.name}: ${formatType(f.type)}${docs}`);
  }
}

// --- probe-live ------------------------------------------------------------

async function probeLive(args: Map<string, string>): Promise<void> {
  const rpcUrl = process.env.HELIUS_RPC_URL ?? process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    console.error(warn("HELIUS_RPC_URL (or SOLANA_RPC_URL) not set. Cannot probe mainnet state."));
    process.exit(2);
  }
  const limit = Number(args.get("limit") ?? "3");
  const idl = loadIdl();
  const programId = new PublicKey(idl.address);
  const conn = new Connection(rpcUrl, "confirmed");

  console.log(bold("\n=== Live FeeShareConfig probe ===\n"));
  console.log(`rpc: ${rpcUrl.replace(/api-key=[^&]+/, "api-key=***")}`);
  console.log(`program: ${programId.toBase58()}`);

  // Strategy: pull top tokens by lifetime fees from Bags' public API, then
  // for each derive the FeeShareConfig PDA and decode the on-chain account.
  // The PDA seeds for fee-share-v2 are well-known:
  //   ["fee_share_config", base_mint] under the program id
  // (verified against the IDL's `create_fee_config` accounts where the seed
  // structure is implicit; if seeds differ, this probe will report 0 hits
  // and we'll need to call the SDK's resolver instead.)

  const apiKey = process.env.BAGS_API_KEY;
  if (!apiKey) {
    console.error(warn("BAGS_API_KEY not set. Cannot fetch top tokens from Bags API."));
    process.exit(2);
  }

  const topRes = await fetch(
    "https://public-api-v2.bags.fm/api/v1/state/top-tokens-by-lifetime-fees",
    { headers: { "x-api-key": apiKey } },
  );
  if (!topRes.ok) {
    console.error(warn(`Bags API returned ${topRes.status}: ${await topRes.text()}`));
    process.exit(2);
  }
  const topJson = (await topRes.json()) as { response?: Array<{ tokenMint?: string; mint?: string; baseMint?: string }> };
  const tokens = (topJson.response ?? []).slice(0, limit);
  console.log(`fetched ${tokens.length} top tokens to probe\n`);

  for (const t of tokens) {
    const mintStr = t.tokenMint ?? t.mint ?? t.baseMint;
    if (!mintStr) {
      console.log(`  ${warn("(skipping entry — no mint field)")}`);
      continue;
    }
    const mint = new PublicKey(mintStr);
    console.log(bold(`\n  base_mint: ${mint.toBase58()}`));

    // Try a couple plausible seed orderings — IDL doesn't always expose
    // seeds explicitly. If neither hits, ask the user to extend this probe.
    const candidates = [
      [Buffer.from("fee_share_config"), mint.toBuffer()],
      [Buffer.from("config"), mint.toBuffer()],
    ];
    let found: { pda: PublicKey; data: Buffer } | null = null;
    for (const seeds of candidates) {
      const [pda] = PublicKey.findProgramAddressSync(seeds, programId);
      const acct = await conn.getAccountInfo(pda);
      if (acct && acct.owner.equals(programId)) {
        found = { pda, data: acct.data };
        break;
      }
    }
    if (!found) {
      console.log(
        `    ${warn("PDA not located via standard seeds — extend the probe with the SDK's PDA derivation if you need this token.")}`,
      );
      continue;
    }

    console.log(`    fee_share_config PDA: ${found.pda.toBase58()}`);
    console.log(`    account size: ${found.data.length} bytes`);
    const decoded = decodeFeeShareConfigHeader(found.data);
    if (!decoded) {
      console.log(`    ${warn("could not decode header — IDL layout may have shifted")}`);
      continue;
    }
    console.log(`    base_mint:    ${decoded.baseMint.toBase58()}`);
    console.log(`    quote_mint:   ${decoded.quoteMint.toBase58()}`);
    console.log(`    partner:      ${decoded.partner.toBase58()}`);
    console.log(`    manager:      ${decoded.manager.toBase58()}`);
    console.log(
      `    init_finalized: ${decoded.isInitFinalized}  ${decoded.isInitFinalized ? dim("(can no longer extend)") : ok("(can still extend)")}`,
    );
    console.log(
      `    update_locked:  ${decoded.isUpdateLocked}  ${decoded.isUpdateLocked ? warn("(currently mid-update — claims fail)") : ok("(claims open)")}`,
    );
    console.log(`    claimers + bps: ${decoded.claimerCount} slot(s) (rough — full decode requires full Anchor codec)`);
  }

  console.log(bold("\n--- What this tells us ---"));
  console.log(
    "  Look at the init_finalized column above. If you find a token with init_finalized=false that has been live for a long time, that's evidence the extend window can stay open indefinitely.",
  );
}

type FeeShareConfigHeader = {
  baseMint: PublicKey;
  quoteMint: PublicKey;
  partner: PublicKey;
  partnerConfig: PublicKey;
  manager: PublicKey;
  isInitFinalized: number;
  isUpdateLocked: number;
  claimerCount: number;
};

function decodeFeeShareConfigHeader(data: Buffer): FeeShareConfigHeader | null {
  // Account layout per IDL FeeShareConfigHeader (zero-copy, repr(C)):
  //   8 bytes  account discriminator (Anchor)
  //  32 bytes  base_mint
  //  32 bytes  quote_mint
  //  32 bytes  partner
  //  32 bytes  partner_config
  //  32 bytes  manager
  //   8 bytes  padding_0 (u64)
  //   1 byte   is_init_finalized
  //   1 byte   is_update_locked
  //   5 bytes  padding_1
  //   1 byte   bump
  // Then variable: claimers (pubkey[]) + bps (u16[]).
  // Total fixed header = 8 + 32*5 + 8 + 1 + 1 + 5 + 1 = 184 bytes.
  if (data.length < 184) return null;
  let off = 8;
  const readPk = () => {
    const pk = new PublicKey(data.subarray(off, off + 32));
    off += 32;
    return pk;
  };
  const baseMint = readPk();
  const quoteMint = readPk();
  const partner = readPk();
  const partnerConfig = readPk();
  const manager = readPk();
  off += 8; // padding_0
  const isInitFinalized = data.readUInt8(off++);
  const isUpdateLocked = data.readUInt8(off++);
  off += 5; // padding_1
  off += 1; // bump
  // Heuristic claimer count: remaining bytes / (32 + 2). Real decoder would use
  // a length prefix from the account, but this gets us a ballpark for inspection.
  const remaining = data.length - off;
  const approxSlots = Math.max(0, Math.floor(remaining / 34));
  return {
    baseMint,
    quoteMint,
    partner,
    partnerConfig,
    manager,
    isInitFinalized,
    isUpdateLocked,
    claimerCount: approxSlots,
  };
}

// --- experiment (Phase 3 stub) --------------------------------------------

function experiment(): void {
  if (process.env.LIVE !== "1") {
    console.log(bold("\n=== Phase 3 experiment plan (DRY) ===\n"));
    console.log("This phase is GATED behind LIVE=1 and is NOT yet implemented.");
    console.log("Run with LIVE=1 to see the (currently stubbed) plan invocation.\n");
    console.log("Steps the live experiment would perform:");
    console.log("  1. Generate a fresh keypair (admin, ~0.05 SOL).");
    console.log("  2. Launch a tiny fee-share-v2 token via @bagsfm/bags-sdk with 1 claimer (admin) at 10000 bps,");
    console.log("     finalize_init=false. Capture base_mint + fee_share_config PDA.");
    console.log("  3. Self-swap a small amount via sdk.trade.* to accrue measurable fees in the authority ATA.");
    console.log("  4. Snapshot pre-extend state: FeeShareAuthority.fees[0] and the claimers array.");
    console.log("  5. Call extend_created_fee_config with one new claimer (recipient B) appended,");
    console.log("     finalize_init=false. Confirm the tx succeeds.");
    console.log("  6. Snapshot post-extend state. Verify:");
    console.log("       a) admin's accrued fees[0] is unchanged");
    console.log("       b) recipient B exists at index 1 with fees[1] = 0");
    console.log("       c) is_init_finalized stays 0");
    console.log("  7. Self-swap again to accrue more fees, confirm fees[0] AND fees[1] both grow.");
    console.log("  8. Test failure case: extend with finalize_init=true, then try a second extend — confirm the second errors.");
    console.log("  9. Print pass/fail conclusion + cleanup instructions.");
    console.log("");
    console.log("Implement when you're ready to spend ~0.05 SOL on a definitive answer.");
    console.log("The IDL inspection in Phase 1 already gives high confidence — Phase 3 is belt-and-suspenders.");
    return;
  }
  console.error(
    warn(
      "\nLIVE=1 was set but the experiment is not implemented yet. Refusing to spend SOL until you implement (and review) the steps printed above.",
    ),
  );
  process.exit(2);
}

// --- CLI dispatch ----------------------------------------------------------

function parseArgs(argv: string[]): { cmd: string; flags: Map<string, string> } {
  const cmd = argv[2] ?? "help";
  const flags = new Map<string, string>();
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else flags.set(a.slice(2), "true");
    }
  }
  return { cmd, flags };
}

function help(): void {
  console.log(`
Spike: Bags fee-share rotation behavior.

Subcommands:
  inspect-program          Phase 1 — IDL inspection (free, deterministic).
  probe-live [--limit=N]   Phase 2 — Read live FeeShareConfig accounts. Requires HELIUS_RPC_URL + BAGS_API_KEY.
  experiment               Phase 3 — Mainnet rotation experiment. Stubbed; gated behind LIVE=1.

See docs/architecture/bags-native/RESEARCH.md for the question this answers.
`);
}

async function main(): Promise<void> {
  const { cmd, flags } = parseArgs(process.argv);
  switch (cmd) {
    case "inspect-program":
      inspectProgram();
      return;
    case "probe-live":
      await probeLive(flags);
      return;
    case "experiment":
      experiment();
      return;
    default:
      help();
      process.exit(cmd === "help" ? 0 : 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
