from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(
        title="DeerFlow BFF",
        version="0.1.0",
        description="Frontend-facing BFF for DeerFlow Gateway.",
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
