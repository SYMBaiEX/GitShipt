# Owner admin bootstrap

The owner must first sign in with the GitHub account SYMBaiEX. An operator with
database administration access can then run the bootstrap from the repository
root, with `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` set in the
environment to the intended database's privileged unpooled connection:

```sh
cd apps/web
bun scripts/bootstrap-owner-admin.ts --confirm-symbaiex-super-admin
```

The script requires exactly one linked GitHub provider account with immutable
account ID `192078165`, promotes its user in a transaction, and records an audit
entry. It makes no change when that user is already a super admin. Verify the
target database before running it; the script does not distinguish production
from other environments. Do not put connection strings in commands or logs.

This bootstrap does not bypass MFA or the requirement for a different super
admin to approve irreversible actions. A single-admin installation cannot
perform those actions until another authorized super admin is provisioned; the
existing role-grant flow itself also requires a second approver.
