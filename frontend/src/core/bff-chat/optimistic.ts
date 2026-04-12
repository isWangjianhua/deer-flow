export function shouldClearPendingHumanMessages({
  pendingHumanMessages,
  baseMessageCount,
  previousBaseMessageCount,
}: {
  pendingHumanMessages: number;
  baseMessageCount: number;
  previousBaseMessageCount: number;
}) {
  return (
    pendingHumanMessages > 0 && baseMessageCount > previousBaseMessageCount
  );
}
