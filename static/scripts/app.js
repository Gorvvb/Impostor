const ws = new WebSocket("ws://localhost:8000/ws");

const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");

const playersDiv = document.getElementById("players");
const chatDiv = document.getElementById("chat");

const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

const startBtn = document.getElementById("startBtn");

startBtn.onclick = () => {
  ws.send(JSON.stringify({
    type: "start_game"
  }));
};


let joined = false;

/* ---------- helpers ---------- */

function addSystemMessage(text) {
  const el = document.createElement("div");
  el.textContent = text;
  el.className = "system";
  chatDiv.appendChild(el);
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function addChatMessage(from, text) {
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `<b>${from}:</b> ${text}`;
  chatDiv.appendChild(el);
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function renderPlayers(players) {
  playersDiv.innerHTML = "";
  for (const name of players) {
    const el = document.createElement("div");
    el.textContent = name;
    playersDiv.appendChild(el);
  }
}

/* ---------- websocket ---------- */

ws.onopen = () => {
  addSystemMessage("Connected to server");
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "lobby_update") {
    renderPlayers(msg.players);
    addSystemMessage("Lobby updated");
  }

  if (msg.type === "chat") {
    addChatMessage(msg.from, msg.text);
  }

  if (msg.type === "system") {
    addSystemMessage(msg.message);
  }

  if (msg.type === "role") {
    if (msg.role === "impostor") {
      alert("You are the IMPOSTOR!\nHint: " + msg.hint);
    } else {
      alert("You are INNOCENT!\nWord: " + msg.word);
    }
  }

  if (msg.type === "error") {
    alert(msg.message);
  }
};


ws.onclose = () => {
  addSystemMessage("Disconnected from server");
};

/* ---------- UI events ---------- */

joinBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name || joined) return;

  ws.send(JSON.stringify({
    type: "join",
    name
  }));

  joined = true;
  nameInput.disabled = true;
  joinBtn.disabled = true;
  chatInput.disabled = false;
  sendBtn.disabled = false;

  addSystemMessage(`You joined as ${name}`);
};

sendBtn.onclick = sendChat;
chatInput.onkeydown = (e) => {
  if (e.key === "Enter") sendChat();
};

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;

  ws.send(JSON.stringify({
    type: "chat",
    text
  }));

  chatInput.value = "";
}
