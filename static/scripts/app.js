const nameInput = document.getElementById("nameInput");
const joinBtn = document.getElementById("joinBtn");
const playersDiv = document.getElementById("players");
const chatDiv = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const startBtn = document.getElementById("startBtn");

let ws = null;
let joined = false;
let myName = "";
let currentPhase = "lobby";

/* 🔑 FIX: track currently open role modal */
let activeRoleModal = null;

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
    el.className = "player";
    playersDiv.appendChild(el);
  }
}

/* ---------- ROLE MODAL (FIXED, SAME UI) ---------- */

function showRoleCard(role, data) {
  /* 🔑 FIX: remove existing modal before creating a new one */
  if (activeRoleModal) {
    activeRoleModal.remove();
    activeRoleModal = null;
  }

  const modal = document.createElement("div");
  modal.className = "modal";

  const content = document.createElement("div");
  content.className = "modal-content";

  content.innerHTML = `
    <h2>${role === "impostor" ? "🎭 YOU ARE THE IMPOSTOR 🎭" : "😇 YOU ARE INNOCENT 😇"}</h2>
    <div class="role-message">
      ${role === "impostor" 
        ? `You are the <strong>IMPOSTOR</strong>!<br><br>
           Your hint: <strong>"${data.hint}"</strong><br><br>
           Pretend to know the word and blend in with the innocent players.` 
        : `You are <strong>INNOCENT</strong>!<br><br>
           The word is: <strong>${data.word}</strong><br><br>
           Find the impostor by discussing with other players.`}
    </div>
    <div class="role-instruction">
      ${role === "impostor" 
        ? "Try to deceive others and avoid being voted out!"
        : "Use /vote [player] to vote out who you think is the impostor!"}
    </div>
    <button class="modal-btn">OK, I'm Ready!</button>
  `;

  const closeBtn = content.querySelector("button");
  closeBtn.onclick = () => {
    modal.remove();
    activeRoleModal = null;
  };

  modal.appendChild(content);
  document.body.appendChild(modal);
  activeRoleModal = modal;
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
  ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.onopen = () => {
    addSystemMessage("Connected to server");
    if (joined && myName) {
      safeSend({ type: "join", name: myName });
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "lobby_update") {
      renderPlayers(msg.players);
      startBtn.disabled = msg.players.length < 2;
    }

    if (msg.type === "chat") {
      addChatMessage(msg.from, msg.text);
    }

    if (msg.type === "system") {
      addSystemMessage(msg.message);
    }

    if (msg.type === "role") {
      showRoleCard(msg.role, msg);
    }

    if (msg.type === "phase_change") {
      currentPhase = msg.phase;
      addSystemMessage(`=== ${msg.message} ===`);
    }

    if (msg.type === "vote_update") {
      addSystemMessage(`Votes cast: ${msg.total_votes}/${msg.required_votes}`);
    }

    if (msg.type === "game_result") {
      addSystemMessage("🎮 GAME OVER 🎮");
      addSystemMessage(msg.message);
      addSystemMessage(`The word was: ${msg.word}`);
      addSystemMessage(`Impostor's hint: "${msg.hint}"`);
      currentPhase = "lobby";
      startBtn.disabled = false;
    }

    if (msg.type === "error") {
      addSystemMessage(`Error: ${msg.message}`);
    }
  };

  ws.onclose = () => {
    addSystemMessage("Disconnected. Reconnecting...");
    setTimeout(connect, 2000);
  };

  ws.onerror = () => ws.close();
}

/* ---------- UI ---------- */

joinBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name || joined) return;

  myName = name;
  joined = true;

  safeSend({ type: "join", name });

  nameInput.disabled = true;
  joinBtn.disabled = true;
  chatInput.disabled = false;
  sendBtn.disabled = false;

  addSystemMessage(`You joined as ${name}`);
};

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  safeSend({ type: "chat", text });
  chatInput.value = "";
}

sendBtn.onclick = sendChat;
chatInput.onkeydown = (e) => e.key === "Enter" && sendChat();

startBtn.onclick = () => {
  safeSend({ type: "start_game" });
  startBtn.disabled = true;
};

/* Show role again button (unchanged behavior, now safe) */
const roleBtn = document.createElement("button");
roleBtn.textContent = "Show My Role Again";
roleBtn.style.marginLeft = "10px";
roleBtn.onclick = () => {
  if (joined && currentPhase !== "lobby") {
    safeSend({ type: "get_role" });
  } else {
    addSystemMessage("No active game or you haven't joined yet");
  }
};
document.querySelector(".controls").appendChild(roleBtn);

connect();
