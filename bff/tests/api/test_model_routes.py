from app.clients.deerflow import DeerFlowClient


def test_models_route_returns_gateway_models(client, monkeypatch) -> None:
    async def mock_get_models(self):
        return {
            "models": [
                {
                    "name": "deepseek-chat",
                    "model": "deepseek-chat",
                    "display_name": "DeepSeek Chat",
                    "description": "Gateway-backed model list",
                    "supports_thinking": True,
                    "supports_reasoning_effort": True,
                }
            ]
        }

    monkeypatch.setattr(DeerFlowClient, "get_models", mock_get_models, raising=False)

    response = client.get("/models")

    assert response.status_code == 200
    assert response.json() == {
        "models": [
            {
                "name": "deepseek-chat",
                "model": "deepseek-chat",
                "display_name": "DeepSeek Chat",
                "description": "Gateway-backed model list",
                "supports_thinking": True,
                "supports_reasoning_effort": True,
            }
        ]
    }
