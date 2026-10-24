"""WebSocket-хаб: живые события заказов для дашборда (вместо чистого поллинга)."""
import jwt
from fastapi import Query, WebSocket, WebSocketDisconnect

from .config import settings


class Hub:
    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def broadcast(self, message: dict) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                self.clients.discard(ws)


hub = Hub()


async def ws_endpoint(ws: WebSocket, token: str = Query(default="")) -> None:
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        await ws.close(code=1008)
        return
    await hub.connect(ws)
    try:
        while True:
            await ws.receive_text()  # пинги клиента; события шлёт broadcast()
    except WebSocketDisconnect:
        hub.disconnect(ws)
