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

function showRoleCard(role, data) {
  const modal = document.createElement("div");
  modal.className = "modal";
  
  const content = document.createElement("div");
  content.className = "modal-content";
  
  content.innerHTML = `
    <h2>${role === "impostor" ? "🎭 YOU ARE THE IMPOSTOR 🎭" : "😇 YOU ARE INNOCENT 😇"}</h2>
    <div class="role-message">
      ${role === "impostor" 
        ? `You are the <strong>IMPOSTOR</strong>!<br><br>Your hint: <strong>"${data.hint}"</strong><br><br>Pretend to know the word and blend in with the innocent players.` 
        : `You are <strong>INNOCENT</strong>!<br><br>The word is: <strong>${data.word}</strong><br><br>Find the impostor by discussing with other players.`}
    </div>
    <div class="role-instruction">
      ${role === "impostor" 
        ? "Try to deceive others and avoid being voted out!"
        : "Use /vote [player] to vote out who you think is the impostor!"}
    </div>
    <button id="closeRoleBtn" class="modal-btn">OK, I'm Ready!</button>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  document.getElementById("closeRoleBtn").onclick = () => {
    modal.remove();
  };
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
      if (msg.role === "impostor") {
        addSystemMessage("You are the IMPOSTOR! Your mission is to deceive others.");
      } else {
        addSystemMessage(`You are INNOCENT! The word is: ${msg.word}`);
      }
    }

    if (msg.type === "error") {
      // Show errors in chat, not as alerts
      addSystemMessage(`Error: ${msg.message}`);
    }

    if (msg.type === "phase_change") {
      currentPhase = msg.phase;
      addSystemMessage(`=== ${msg.message} ===`);
    }

    if (msg.type === "vote_update") {
      // Only show total votes, not who has votes
      addSystemMessage(`Votes cast: ${msg.total_votes}/${msg.required_votes}`);
    }

    if (msg.type === "game_result") {
      // Show results in chat, not as alerts
      addSystemMessage(`🎮 GAME OVER 🎮`);
      addSystemMessage(msg.message);
      addSystemMessage(`The word was: ${msg.word}`);
      addSystemMessage(`Impostor's hint: "${msg.hint}"`);
      currentPhase = "lobby";
      
      // Reset start button
      startBtn.disabled = false;
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

  myName = name;
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

startBtn.onclick = () => {
  safeSend({ type: "start_game" });
  startBtn.disabled = true;
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      startBtn.disabled = false;
    }
  }, 2000);
};

// Connect on load
connect();

// Add re-show role button
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
document.querySelector("div").appendChild(roleBtn);