import postgres from "postgres";
import { OWNER_GITHUB_ACCOUNT_ID, selectOwnerAccount } from "../lib/auth/owner-bootstrap";

// GitHub API /users/SYMBaiEX, verified 2026-11-17. GitHub numeric IDs survive renames.
const ownerAccountId = OWNER_GITHUB_ACCOUNT_ID;

if (process.argv[2] !== "--confirm-symbaiex-super-admin") {
  throw new Error("Pass --confirm-symbaiex-super-admin to bootstrap the linked GitHub account.");
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING is required.");

const sql = postgres(url, { max: 1 });
try {
  await sql.begin(async (tx) => {
    const matches = await tx<{ id: string; role: string; providerId: string; accountId: string }[]>`
      SELECT u.id, u.role, a.provider_id AS "providerId", a.account_id AS "accountId" FROM users u
      JOIN accounts a ON a.user_id = u.id
      WHERE a.provider_id = 'github' AND a.account_id = ${ownerAccountId}
      FOR UPDATE OF u
    `;
    const owner = selectOwnerAccount(matches);
    if (owner.role === "super_admin") {
      console.log("SYMBaiEX is already a super admin; no change made.");
      return;
    }
    await tx`UPDATE users SET role = 'super_admin', updated_at = now() WHERE id = ${owner.id}`;
    await tx`
      INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata)
      VALUES (${crypto.randomUUID()}, NULL, 'admin.bootstrap', 'user', ${owner.id},
        ${tx.json({ githubAccountId: ownerAccountId, previousRole: owner.role })})
    `;
    console.log("SYMBaiEX was granted super admin; an audit entry was recorded.");
  });
} finally {
  await sql.end();
}
