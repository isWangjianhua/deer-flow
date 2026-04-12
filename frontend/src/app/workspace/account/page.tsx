import { AuthStatusCard } from "@/components/auth/auth-status-card";

export default function WorkspaceAccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-muted-foreground text-sm">
          Manage your sign-in, verify your BFF connection, and keep low-level
          diagnostics out of the way until you actually need them.
        </p>
      </div>
      <AuthStatusCard />
    </div>
  );
}
