import { Suspense } from "react";
import Image from "next/image";
import { Users } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { Card, CardHeader, CardTitle, CardDescription } from "@repo/ui";
import { Badge } from "@repo/ui";
import { getAllUsers } from "@/lib/queries/admin";
import { formatRelativeTime } from "@repo/lib";
import { UserManagePanel } from "./_components/UserManagePanel";


export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersPageContent />
    </Suspense>
  );
}

async function AdminUsersPageContent() {
  await requireAdminPage("admin.access", "/admin");

  const rows = await getAllUsers();

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-headline-md">Users</h1>
          <p className="text-body-sm text-fg-secondary">
            Up to 500 most recent. Manage role + MFA + sybil flags.
          </p>
        </div>
        <Badge variant="default" size="sm">
          {rows.length} users
        </Badge>
      </header>

      <Card depth="flat" padding="none" className="overflow-hidden">
        <CardHeader className="px-4 pt-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-fg-muted" /> Directory
          </CardTitle>
          <CardDescription>
            Grants are gated by `admin.users.role.grant`.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-elevated/50 text-label-sm text-fg-muted">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">GitHub</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">MFA</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-border/40 hover:bg-surface-elevated/40"
                >
                  <td className="px-4 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {u.image ? (
                        <Image
                          src={u.image}
                          alt=""
                          width={24}
                          height={24}
                          sizes="24px"
                          className="size-6 shrink-0 rounded-full"
                        />
                      ) : (
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-elevated text-caption text-fg-muted">
                          {u.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-fg">{u.name}</div>
                        <div className="truncate text-mono-sm text-fg-muted">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-mono-sm text-fg-secondary">
                    {u.githubUsername ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-2">
                    {u.mfaEnabled ? (
                      <Badge variant="success" size="sm">
                        enabled
                      </Badge>
                    ) : (
                      <Badge variant="default" size="sm">
                        off
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-mono-sm text-fg-muted">
                    {formatRelativeTime(u.createdAt)}
                  </td>
                  <td className="px-4 py-2">
                    <UserManagePanel
                      userId={u.id}
                      userName={u.name}
                      role={u.role}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  switch (role) {
    case "super_admin":
      return (
        <Badge variant="danger" size="sm">
          super_admin
        </Badge>
      );
    case "admin":
      return (
        <Badge variant="warning" size="sm">
          admin
        </Badge>
      );
    case "moderator":
      return (
        <Badge variant="info" size="sm">
          moderator
        </Badge>
      );
    default:
      return (
        <Badge variant="default" size="sm">
          user
        </Badge>
      );
  }
}
