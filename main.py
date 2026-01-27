from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Dict
import random

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")

# --- GAME STATE ---

clients: Dict[WebSocket, str] = {}   # ws -> name
names_to_ws: Dict[str, WebSocket] = {}  # name -> ws

# --- HELPERS ---

async def broadcast(message: dict):
    for ws in clients:
        await ws.send_json(message)

async def send_private(ws: WebSocket, message: dict):
    await ws.send_json(message)

# --- WEBSOCKET ---

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            data = await ws.receive_json()

            # ---- JOIN ----
            if data["type"] == "join":
                name = data["name"]

                # prevent duplicate names
                if name in names_to_ws:
                    await send_private(ws, {
                        "type": "error",
                        "message": "Name already taken"
                    })
                    continue

                clients[ws] = name
                names_to_ws[name] = ws

                await broadcast({
                    "type": "lobby_update",
                    "players": list(names_to_ws.keys())
                })

            # ---- CHAT ----
            elif data["type"] == "chat":
                await broadcast({
                    "type": "chat",
                    "from": clients.get(ws, "Unknown"),
                    "text": data["text"]
                })

            # ---- START GAME (TEMP: ANYONE CAN START) ----
            elif data["type"] == "start_game":
                await start_game()

    except WebSocketDisconnect:
        name = clients.pop(ws, None)
        if name:
            names_to_ws.pop(name, None)

        await broadcast({
            "type": "lobby_update",
            "players": list(names_to_ws.keys())
        })

# --- GAME LOGIC ---

async def start_game():
    if len(clients) < 2:
        return

    names = list(names_to_ws.keys())
    impostor = random.choice(names)
    word = "Apple"
    hint = "Fruit"

    for name, ws in names_to_ws.items():
        if name == impostor:
            await send_private(ws, {
                "type": "role",
                "role": "impostor",
                "hint": hint
            })
        else:
            await send_private(ws, {
                "type": "role",
                "role": "innocent",
                "word": word
            })

    await broadcast({
        "type": "system",
        "message": "Game started"
    })
