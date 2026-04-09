import { AuthStatusCard } from "@/components/auth/auth-status-card";

export default function WorkspaceAccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-muted-foreground text-sm">
          Use this page to validate browser OIDC login, Better Auth session
          recovery, and the first authenticated request to the FastAPI BFF.
        </p>
      </div>
      <AuthStatusCard />
    </div>
  );
}
