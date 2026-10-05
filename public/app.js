let socket;
try {
  socket = io();
} catch (err) {
  document.body.innerHTML = '<div style="padding:20px;color:red;">Socket failed: ' + err.message + '</div>';
}

let state = null;
let myName = '';
let myCode = '';
let pendingTarget = null;
let pendingType = null;
let pendingVote = null;

const app = document.getElementById('app');

socket.on('state', (s) => {
  state = s;
  if (!myCode && s.code) myCode = s.code;
  render();
});

// Render the home screen IMMEDIATELY on page load
renderHome();


function render() {
  if (!state) {
    renderHome();
    return;
  }

  const me = state.players.find((p) => p.isYou);

  let html = '';
  html += `<div class="header">
    <div class="brand">🦔 HEDGEHOG</div>
    <div>Room <b>${state.code}</b>${state.round > 0 ? ` · R${state.round}/${state.maxRounds}` : ''}</div>
  </div>`;

  if (state.phase === 'lobby') html += renderLobby(me);
  else if (state.phase === 'sabotage') html += renderSabotage(me);
  else if (state.phase === 'reveal') html += renderReveal(me);
  else if (state.phase === 'vote') html += renderVote(me);
  else if (state.phase === 'game_over') html += renderGameOver(me);

  app.innerHTML = html;
  attachHandlers();
  if (state.phaseEndsAt) startTimerLoop();
}

function renderHome() {
  app.innerHTML = `
    <div style="text-align:center;margin-top:60px;margin-bottom:30px;">
      <h1 style="font-size:36px;color:#ff4d6d;margin-bottom:8px;">🦔 HEDGEHOG</h1>
      <p class="muted">Betrayal. Sabotage. Chaos.</p>
    </div>
    <div class="panel">
      <label class="muted">Your name</label>
      <input class="input" id="nameInput" maxlength="16" placeholder="Enter name" />
      <button class="btn btn-primary" id="createBtn" style="margin-bottom:12px;">Create room</button>
      <div style="text-align:center;opacity:.5;font-size:12px;margin:12px 0;">— or join —</div>
      <input class="input" id="codeInput" maxlength="4" placeholder="CODE" style="text-transform:uppercase;text-align:center;font-family:monospace;font-size:20px;letter-spacing:4px;" />
      <button class="btn btn-ghost" id="joinBtn" style="width:100%;">Join</button>
    </div>
  `;
  document.getElementById('nameInput').oninput = (e) => (myName = e.target.value);
  document.getElementById('createBtn').onclick = () => {
    if (!myName.trim()) return alert('Enter a name');
    socket.emit('create_room', { name: myName.trim() });
  };
  document.getElementById('joinBtn').onclick = () => {
    const code = document.getElementById('codeInput').value.trim().toUpperCase();
    if (!myName.trim()) return alert('Enter a name');
    if (code.length !== 4) return alert('4-letter code required');
    socket.emit('join_room', { code, name: myName.trim() }, (res) => {
      if (!res.ok) alert(res.error || 'Could not join');
    });
  };
}

function renderLobby(me) {
  const isHost = me && me.id === state.hostId;
  const canStart = state.players.length >= 2;

  let html = `<div class="panel center">
    <p class="muted">Share this code</p>
    <div class="code-display">${state.code}</div>
    <p class="muted">${state.players.length}/8 players</p>
  </div>
  <div class="panel">
    <h3>Players</h3>
    <ul class="player-list">
      ${state.players.map((p) => `
        <li class="${p.isYou ? 'you' : ''}">
          <span>${escapeHtml(p.name)}${p.id === state.hostId ? '<span class="badge host">HOST</span>' : ''}</span>
          ${p.isYou ? '<span class="muted">you</span>' : ''}
        </li>
      `).join('')}
    </ul>
  </div>`;

  if (isHost) {
    html += `<button class="btn btn-primary" id="startBtn" ${!canStart ? 'disabled' : ''}>
      ${canStart ? 'Start game' : 'Need 2+ players'}
    </button>`;
  } else {
    html += `<p class="center muted">Waiting for host…</p>`;
  }
  return html;
}

function renderSabotage(me) {
  const others = state.players.filter((p) => !p.isYou && !p.exiled);

  if (me?.exiled) {
    return `${timerHtml(25)}
      <div class="panel center">
        <div class="big-emoji">👻</div>
        <h2>Spectator Mode</h2>
        <p class="muted">You can see everything unfold</p>
      </div>
      ${playerStatusList()}`;
  }

  if (state.yourSabotage) {
    return `${timerHtml(25)}
      <div class="panel center" style="padding:32px;">
        <p style="color:#4ade80;font-weight:700;font-size:18px;">Sabotage locked ✅</p>
        <p class="muted" style="margin-top:8px;">Waiting for other hedgehogs…</p>
      </div>
      ${playerStatusList()}`;
  }

  return `${timerHtml(25)}
    <div class="panel">
      <h3>🎯 Pick a target</h3>
      <div class="grid-2" id="targetGrid">
        ${others.map((p) => `
          <button class="tile" data-target="${p.id}">
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="sub">${p.score} pts</div>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="panel">
      <h3>🔪 Pick sabotage</h3>
      <div id="typeGrid">
        <button class="tile" data-type="steal" style="width:100%;margin-bottom:8px;">
          <div class="name">💰 Steal</div>
          <div class="sub">-100 from target</div>
        </button>
        <button class="tile" data-type="block" style="width:100%;margin-bottom:8px;">
          <div class="name">🚫 Block</div>
          <div class="sub">Target gains 0 this round</div>
        </button>
        <button class="tile" data-type="frame" style="width:100%;">
          <div class="name">🎭 Frame</div>
          <div class="sub">-75 from target</div>
        </button>
      </div>
    </div>
    <button class="btn btn-primary" id="submitSabotage" disabled>Lock in sabotage</button>`;
}

function renderReveal(me) {
  let html = `${timerHtml(20)}
    <div class="panel">
      <h3>💥 Chaos Revealed</h3>
      ${state.revealLog.length === 0
        ? `<p class="muted center" style="padding:12px;">No sabotages landed.</p>`
        : state.revealLog.map((r) => `
          <div class="reveal-item">
            <span><b>${escapeHtml(r.actorName)}</b> → <b>${escapeHtml(r.targetName)}</b> <span class="muted">(${r.type})</span></span>
            <span class="pts">${r.effect}</span>
          </div>
        `).join('')}
    </div>
    ${scoreboard()}
    ${chatHtml()}`;

  if (me?.exiled) {
    html += `<div class="panel">
      <p class="muted center" style="margin-bottom:8px;">React (spectator power)</p>
      <div class="emoji-bar" id="emojiBar">
        ${['😂','🔥','💀','👏','🐍','🤡'].map((e) => `<button data-emoji="${e}">${e}</button>`).join('')}
      </div>
    </div>`;
  }
  return html;
}

function renderVote(me) {
  const others = state.players.filter((p) => !p.isYou && !p.exiled);
  let html = `${timerHtml(40)}${chatHtml()}`;

  if (me?.exiled) {
    html += `<div class="panel center"><p class="muted">You're exiled — can't vote.</p></div>`;
  } else if (state.yourVote) {
    html += `<div class="panel center" style="padding:32px;">
      <p style="color:#4ade80;font-weight:700;font-size:18px;">Vote locked ✅</p>
      <p class="muted" style="margin-top:8px;">Waiting for others…</p>
    </div>`;
  } else {
    html += `<div class="panel">
      <h3>🗳️ Vote to exile</h3>
      <div class="grid-2" id="voteGrid">
        ${others.map((p) => `
          <button class="tile" data-vote="${p.id}">
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="sub">${p.score} pts</div>
          </button>
        `).join('')}
      </div>
    </div>
    <button class="btn btn-primary" id="submitVote" disabled>Lock in vote</button>`;
  }
  html += playerStatusList('voted');
  return html;
}

function renderGameOver(me) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return `
    <div class="panel center" style="padding:32px 16px;">
      <div class="big-emoji">🏆</div>
      <p class="muted">Winner</p>
      <p class="winner-name">${escapeHtml(winner?.name || '')}</p>
      <p class="muted" style="margin-top:4px;">${winner?.score || 0} points</p>
    </div>
    <div class="panel">
      <h3>Final standings</h3>
      ${sorted.map((p, i) => `
        <div class="score-row ${i === 0 ? 'first' : ''} ${p.exiled ? 'exiled' : ''}">
          <span>
            <span class="muted" style="margin-right:8px;">${i + 1}.</span>
            <b>${escapeHtml(p.name)}</b>
            ${p.isYou ? '<span class="muted"> (you)</span>' : ''}
            ${p.exiled ? ' <span class="muted">👻</span>' : ''}
          </span>
          <span style="font-family:monospace;font-weight:700;">${p.score}</span>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-ghost" style="width:100%;" onclick="location.reload()">Play again</button>
  `;
}

function timerHtml(total) {
  return `<div class="panel">
    <div class="timer">
      <div class="timer-num" id="timerNum">—</div>
      <div class="timer-bar"><div class="timer-fill" id="timerFill"></div></div>
    </div>
  </div>`;
}

function chatHtml() {
  const me = state.players.find((p) => p.isYou);
  const canChat = me && !me.exiled;
  return `<div class="panel chat">
    <h3 style="font-size:14px;opacity:.7;">Accusations</h3>
    <div class="chat-log" id="chatLog">
      ${state.chat.map((m) => `
        <div>
          <span class="chat-name">${escapeHtml(m.name)}:</span>
          <span>${escapeHtml(m.text)}</span>
        </div>
      `).join('')}
      ${state.chat.length === 0 ? '<div class="muted" style="font-size:12px;">No messages yet…</div>' : ''}
    </div>
    <form class="chat-form" id="chatForm">
      <input class="input" id="chatInput" maxlength="200" placeholder="${canChat ? 'Say something…' : 'You are exiled'}" ${!canChat ? 'disabled' : ''} />
      <button class="btn btn-primary" style="width:auto;" ${!canChat ? 'disabled' : ''}>Send</button>
    </form>
  </div>`;
}

function scoreboard() {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return `<div class="panel">
    <h3 style="font-size:14px;opacity:.7;">Scoreboard</h3>
    ${sorted.map((p) => `
      <div class="score-row ${p.exiled ? 'exiled' : ''}">
        <span>${escapeHtml(p.name)}${p.isYou ? ' (you)' : ''}</span>
        <span style="font-family:monospace;">${p.score}</span>
      </div>
    `).join('')}
  </div>`;
}

function playerStatusList(mode = 'sabotaged') {
  return `<div class="panel">
    <h3 style="font-size:14px;opacity:.7;">Players</h3>
    <ul class="player-list">
      ${state.players.map((p) => `
        <li class="${p.exiled ? 'exiled' : ''} ${p.isYou ? 'you' : ''}">
          <span>${escapeHtml(p.name)}${p.isYou ? ' (you)' : ''}</span>
          <span class="muted">${mode === 'voted' ? (p.hasVoted ? '✅' : '…') : (p.hasSabotaged ? '✅' : '…')}</span>
        </li>
      `).join('')}
    </ul>
  </div>`;
}

function attachHandlers() {
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.onclick = () => {
      socket.emit('start_game', { code: state.code }, (res) => {
        if (!res?.ok) alert(res?.error || 'Cannot start');
      });
    };
  }

  const targetGrid = document.getElementById('targetGrid');
  if (targetGrid) {
    targetGrid.querySelectorAll('[data-target]').forEach((btn) => {
      btn.onclick = () => {
        pendingTarget = btn.dataset.target;
        targetGrid.querySelectorAll('.tile').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        updateSabotageButton();
      };
    });
  }

  const typeGrid = document.getElementById('typeGrid');
  if (typeGrid) {
    typeGrid.querySelectorAll('[data-type]').forEach((btn) => {
      btn.onclick = () => {
        pendingType = btn.dataset.type;
        typeGrid.querySelectorAll('.tile').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        updateSabotageButton();
      };
    });
  }

  const submitSabotage = document.getElementById('submitSabotage');
  if (submitSabotage) {
    submitSabotage.onclick = () => {
      if (!pendingTarget || !pendingType) return;
      socket.emit('sabotage', { code: state.code, targetId: pendingTarget, type: pendingType });
      pendingTarget = null;
      pendingType = null;
    };
  }

  const voteGrid = document.getElementById('voteGrid');
  if (voteGrid) {
    voteGrid.querySelectorAll('[data-vote]').forEach((btn) => {
      btn.onclick = () => {
        pendingVote = btn.dataset.vote;
        voteGrid.querySelectorAll('.tile').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        const submit = document.getElementById('submitVote');
        if (submit) submit.disabled = false;
      };
    });
  }

  const submitVote = document.getElementById('submitVote');
  if (submitVote) {
    submitVote.onclick = () => {
      if (!pendingVote) return;
      socket.emit('vote', { code: state.code, targetId: pendingVote });
      pendingVote = null;
    };
  }

  const emojiBar = document.getElementById('emojiBar');
  if (emojiBar) {
    emojiBar.querySelectorAll('[data-emoji]').forEach((btn) => {
      btn.onclick = () => {
        socket.emit('reaction', { code: state.code, emoji: btn.dataset.emoji });
      };
    });
  }

  const chatForm = document.getElementById('chatForm');
  if (chatForm) {
    chatForm.onsubmit = (e) => {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      if (!input.value.trim()) return;
      socket.emit('chat', { code: state.code, text: input.value });
      input.value = '';
    };
    const log = document.getElementById('chatLog');
    if (log) log.scrollTop = log.scrollHeight;
  }
}

function updateSabotageButton() {
  const btn = document.getElementById('submitSabotage');
  if (btn) btn.disabled = !(pendingTarget && pendingType);
}

let timerInterval = null;
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  const update = () => {
    const num = document.getElementById('timerNum');
    const fill = document.getElementById('timerFill');
    if (!num || !fill || !state?.phaseEndsAt) {
      if (timerInterval) clearInterval(timerInterval);
      return;
    }
    const remaining = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
    num.textContent = remaining;
    const total = state.phase === 'sabotage' ? 25 : state.phase === 'reveal' ? 20 : 40;
    const pct = Math.max(0, Math.min(1, (state.phaseEndsAt - Date.now()) / (total * 1000)));
    fill.style.width = `${pct * 100}%`;
  };
  update();
  timerInterval = setInterval(update, 100);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}