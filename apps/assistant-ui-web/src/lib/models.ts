import { buildGatewayUrl } from "./config";

export type GatewayModel = {
  name: string;
  model: string;
  display_name?: string | null;
  description?: string | null;
  supports_thinking: boolean;
  supports_reasoning_effort: boolean;
};

type ModelsResponse = {
  models: GatewayModel[];
};

export async function listModels(): Promise<GatewayModel[]> {
  const response = await fetch(buildGatewayUrl("/api/models"), {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Gateway request failed with ${response.status}`);
  }

  const payload = (await response.json()) as ModelsResponse;
  return payload.models;
}
