import { AgentGallery } from "@/components/workspace/agents/agent-gallery";
import { AgentsDisabledState } from "@/components/workspace/agents/agents-disabled-state";
import { isAgentsUiEnabled } from "@/core/agents/feature";

export default function AgentsPage() {
  return isAgentsUiEnabled() ? <AgentGallery /> : <AgentsDisabledState />;
}
