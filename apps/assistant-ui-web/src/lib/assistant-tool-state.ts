export function isToolResultStreaming(
  statusType: string | undefined,
  hasResult: boolean,
  isStreaming: boolean,
) {
  if (hasResult) {
    return false;
  }

  return (
    statusType === "running" ||
    statusType === "pending" ||
    statusType === "in_progress" ||
    isStreaming
  );
}
