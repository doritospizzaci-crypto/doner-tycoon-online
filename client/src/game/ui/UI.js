import { ROLES } from '/shared/layout.js';

const $ = (id) => document.getElementById(id);

// DOM tabanlı arayüz: lobi, HUD, sohbet, menü. Metinler textContent ile yazılır (XSS yok).
export class UI {
  constructor() {
    this.el = {
      lobby: $('lobby'), hud: $('hud'), menu: $('menu'), fatal: $('fatal'),
      name: $('name'), code: $('code'), lobbyMsg: $('lobby-msg'),
      conn: $('conn'), connText: $('conn-text'), connMini: $('conn-mini'),
      roomCode: $('room-code'), players: $('players'),
      chatlog: $('chatlog'), chatform: $('chatform'), chatinput: $('chatinput'),
      hint: $('hint'), touch: $('touch'), act: $('btn-act'),
      quality: $('set-quality'), fx: $('set-fx'), role: $('set-role'),
    };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.chatOpen = false;
    this.menuOpen = false;

    const roleSel = this.el.role;
    roleSel.append(new Option('Rol seçme', ''));
    for (const r of ROLES) roleSel.append(new Option(r.label, r.id));

    this.el.code.addEventListener('input', () => {
      this.el.code.value = this.el.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    if (this.isTouch) this.el.touch.hidden = false;
    try { this.el.name.value = localStorage.getItem('dto_name') || ''; } catch { /* yok say */ }
    const q = new URLSearchParams(location.search).get('oda');
    if (q) this.el.code.value = q.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  }

  fatal(msg) { this.el.fatal.textContent = msg; this.el.fatal.hidden = false; }
  lobbyMessage(msg) { this.el.lobbyMsg.textContent = msg || ''; }

  setStatus(status) {
    const map = {
      connecting: ['Sunucuya bağlanıyor… (ücretsiz sunucu uyuyorsa 30-60 sn sürebilir)', ''],
      connected: ['Sunucuya bağlı', 'ok'],
      reconnecting: ['Bağlantı koptu, yeniden bağlanıyor…', ''],
      error: ['Sunucuya ulaşılamıyor. Birazdan tekrar denenecek.', 'bad'],
    };
    const [text, cls] = map[status] || map.connecting;
    this.el.connText.textContent = text;
    this.el.conn.className = 'conn ' + cls;
    this.el.connMini.className = 'conn-mini ' + cls;
    this.el.connMini.title = text;
  }

  showGame(code) {
    this.el.lobby.hidden = true;
    this.el.hud.hidden = false;
    this.el.roomCode.textContent = code;
    this.el.chatlog.replaceChildren();
  }

  showLobby() {
    this.el.hud.hidden = true;
    this.el.lobby.hidden = false;
    this.setMenu(false);
    this.setChat(false);
  }

  renderPlayers(room, myId) {
    const frag = document.createDocumentFragment();
    for (const p of room.players) {
      const d = document.createElement('div');
      d.className = 'pl' + (p.connected ? '' : ' off');
      const dot = document.createElement('i');
      dot.style.background = p.color;
      const n = document.createElement('span');
      n.textContent = (p.id === room.hostId ? '👑 ' : '') + p.name + (p.id === myId ? ' (sen)' : '');
      d.append(dot, n);
      const role = ROLES.find((r) => r.id === p.role);
      if (role) { const s = document.createElement('small'); s.textContent = role.label; d.append(s); }
      frag.append(d);
    }
    this.el.players.replaceChildren(frag);
    this.el.roomCode.textContent = room.code;
  }

  addChat(text, { system = false, name = '' } = {}) {
    const d = document.createElement('div');
    if (system) d.className = 'sys';
    d.textContent = system ? text : `${name}: ${text}`;
    this.el.chatlog.append(d);
    while (this.el.chatlog.children.length > 30) this.el.chatlog.firstChild.remove();
    setTimeout(() => d.classList.add('old'), 9000);
  }

  setChat(open) {
    this.chatOpen = open;
    this.el.chatform.hidden = !open;
    document.body.classList.toggle('chat-open', open);
    if (open) this.el.chatinput.focus(); else this.el.chatinput.blur();
  }

  setMenu(open) {
    this.menuOpen = open;
    this.el.menu.hidden = !open;
  }

  setHint(station) {
    const h = this.el.hint;
    if (!station) { h.hidden = true; this.el.act.classList.remove('ready'); return; }
    h.hidden = false;
    h.replaceChildren();
    if (!this.isTouch) { const k = document.createElement('kbd'); k.textContent = 'E'; h.append(k); }
    h.append(document.createTextNode(station.label));
    this.el.act.classList.add('ready');
  }
}
