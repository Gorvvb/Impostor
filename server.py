from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Dict
import random
import json
import os
import re

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI()

app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR / "static"),
    name="static"
)


@app.get("/")
async def root():
    return FileResponse(BASE_DIR / "static" / "index.html")


# --- GAME STATE ---
clients: Dict[WebSocket, str] = {}   # ws -> name
names_to_ws: Dict[str, WebSocket] = {}  # name -> ws

game_state = {
    "status": "lobby",
    "current_word": "",
    "current_hint": "",
    "impostor": "",
    "votes": {},
    "vote_counts": {},
    "voters_notified": set()
}


def load_words():
    try:
        words_path = "static/words.json"
        if os.path.exists(words_path):
            with open(words_path, "r") as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading words: {e}")
    return [
        {"word": "Chess", "hint": "Moves matter"},
        {"word": "Monopoly", "hint": "Positions change"},
        {"word": "Pizza", "hint": "Something round"}
    ]


# --- HELPERS ---
async def broadcast(message: dict):
    for ws in clients:
        try:
            await ws.send_json(message)
        except:
            pass


async def send_private(ws: WebSocket, message: dict):
    try:
        await ws.send_json(message)
    except:
        pass


async def send_roles_to_all():
    for name, ws in names_to_ws.items():
        if name == game_state["impostor"]:
            await send_private(ws, {
                "type": "role",
                "role": "impostor",
                "hint": game_state["current_hint"]
            })
        else:
            await send_private(ws, {
                "type": "role",
                "role": "innocent",
                "word": game_state["current_word"]
            })


def find_player_by_name(name: str):
    name_lower = name.lower().strip()
    for player_name in names_to_ws.keys():
        if player_name.lower() == name_lower:
            return player_name
    return None


async def process_vote(voter: str, target_name: str):
    if game_state["status"] not in ["discussion", "voting"]:
        return False, "Voting not available"

    actual_target = find_player_by_name(target_name)
    if not actual_target:
        return False, f"Player '{target_name}' not found"

    if actual_target == voter:
        return False, "Cannot vote for yourself"

    if game_state["status"] == "discussion":
        game_state["status"] = "voting"
        await broadcast({
            "type": "phase_change",
            "phase": "voting",
            "message": "Voting has started!"
        })

    game_state["votes"][voter] = actual_target

    game_state["vote_counts"] = {}
    for target in game_state["votes"].values():
        game_state["vote_counts"][target] = game_state["vote_counts"].get(target, 0) + 1

    if voter not in game_state["voters_notified"]:
        game_state["voters_notified"].add(voter)
        await broadcast({
            "type": "system",
            "message": "A player has voted."
        })

    await broadcast({
        "type": "vote_update",
        "total_votes": len(game_state["votes"]),
        "required_votes": len(clients)
    })

    if len(game_state["votes"]) == len(clients):
        await end_voting()

    return True, f"Voted for {actual_target}"


async def end_voting():
    vote_count = {}
    for target in game_state["votes"].values():
        vote_count[target] = vote_count.get(target, 0) + 1

    max_votes = 0
    voted_out = None

    for player, count in vote_count.items():
        if count > max_votes:
            max_votes = count
            voted_out = player

    game_state["status"] = "ended"

    if voted_out == game_state["impostor"]:
        result = {
            "winner": "innocents",
            "message": f"The impostor ({voted_out}) was voted out! Innocents win!",
            "impostor": game_state["impostor"],
            "word": game_state["current_word"],
            "hint": game_state["current_hint"]
        }
    else:
        result = {
            "winner": "impostor",
            "message": f"{voted_out} was voted out. The impostor wins!",
            "impostor": game_state["impostor"],
            "word": game_state["current_word"],
            "hint": game_state["current_hint"]
        }

    await broadcast({
        "type": "game_result",
        **result
    })

    game_state["status"] = "lobby"
    game_state["votes"] = {}
    game_state["vote_counts"] = {}
    game_state["voters_notified"] = set()


# --- WEBSOCKET ---
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    try:
        while True:
            data = await ws.receive_json()

            if data["type"] == "join":
                name = data["name"]

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

            elif data["type"] == "chat":
                text = data["text"]
                sender = clients.get(ws, "Unknown")

                if text.strip().startswith('/'):
                    if re.match(r'^\s*/\s*vote\s+', text, re.IGNORECASE):
                        if game_state["status"] in ["discussion", "voting"]:
                            match = re.match(r'^\s*/\s*vote\s+(.+)$', text, re.IGNORECASE)
                            if match:
                                target = match.group(1).strip()
                                success, message = await process_vote(sender, target)
                                if not success:
                                    await send_private(ws, {
                                        "type": "error",
                                        "message": message
                                    })
                                else:
                                    await send_private(ws, {
                                        "type": "system",
                                        "message": message
                                    })
                        else:
                            pass
                    else:
                        pass
                else:
                    await broadcast({
                        "type": "chat",
                        "from": sender,
                        "text": text
                    })

            elif data["type"] == "start_game":
                if len(clients) < 2:
                    await send_private(ws, {
                        "type": "error",
                        "message": "Need at least 2 players"
                    })
                    continue

                words = load_words()
                word_data = random.choice(words)
                game_state["current_word"] = word_data["word"]
                game_state["current_hint"] = word_data["hint"]

                names = list(names_to_ws.keys())
                game_state["impostor"] = random.choice(names)
                game_state["status"] = "discussion"
                game_state["votes"] = {}
                game_state["vote_counts"] = {}
                game_state["voters_notified"] = set()

                await broadcast({
                    "type": "system",
                    "message": "Game started! Check your role."
                })

                await send_roles_to_all()

                await broadcast({
                    "type": "phase_change",
                    "phase": "discussion",
                    "message": "Discussion phase. Use /vote [player] when ready."
                })

            elif data["type"] == "get_role":
                name = clients.get(ws)
                if name and game_state["status"] != "lobby":
                    if name == game_state["impostor"]:
                        await send_private(ws, {
                            "type": "role",
                            "role": "impostor",
                            "hint": game_state["current_hint"]
                        })
                    else:
                        await send_private(ws, {
                            "type": "role",
                            "role": "innocent",
                            "word": game_state["current_word"]
                        })

    except WebSocketDisconnect:
        name = clients.pop(ws, None)
        if name:
            names_to_ws.pop(name, None)
            if name in game_state.get("votes", {}):
                game_state["votes"].pop(name, None)

            # 🔧 FIX: re-check voting completion after disconnect
            if game_state["status"] == "voting" and len(game_state["votes"]) == len(clients):
                await end_voting()

        await broadcast({
            "type": "lobby_update",
            "players": list(names_to_ws.keys())
        })
