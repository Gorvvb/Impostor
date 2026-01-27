const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const playersDiv = document.getElementById("players");
const chatDiv = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

// Temp
const startBtn = document.getElementById("startBtn");

let ws = null;
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

/* ---------- WebSocket ---------- */

function safeSend(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  } else {
    addSystemMessage("Not connected yet");
  }
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${protocol}://${location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    addSystemMessage("Connected to server");

    // Auto-rejoin if already joined
    if (joined) {
      safeSend({ type: "join", name: nameInput.value });
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "lobby_update") {
      renderPlayers(msg.players);
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
    addSystemMessage("Disconnected. Reconnecting...");
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

/* ---------- UI events ---------- */

joinBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name || joined) return;

  safeSend({ type: "join", name });

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

  safeSend({ type: "chat", text });
  chatInput.value = "";
}

// Start game button (temp)
startBtn.onclick = () => {
  safeSend({ type: "start_game" });
};

// Connect on load
connect();
