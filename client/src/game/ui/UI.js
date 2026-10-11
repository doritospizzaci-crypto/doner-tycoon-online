import { ROLES } from '/shared/layout.js';
import { ITEM_LABELS, STATION_ACTIONS } from '/shared/gameLogic.js';

const $ = (id) => document.getElementById(id);

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
      money: $('money'), stock: $('stock'), orders: $('orders'),
      hands: $('hands'), rep: $('rep'), served: $('served'),
      toast: $('toast'),
    };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.chatOpen = false;
    this.menuOpen = false;
    this.lastStation = null;

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
      // elindeki ürünler
      if (p.hands && p.hands.length) {
        const h = document.createElement('small');
        h.className = 'hand-tag';
        h.textContent = '🖐️ ' + p.hands.map((it) => ITEM_LABELS[it.type] || it.type).join(', ');
        d.append(h);
      }
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
    this.lastStation = station;
    const h = this.el.hint;
    if (!station) { h.hidden = true; this.el.act.classList.remove('ready'); return; }
    h.hidden = false;
    h.replaceChildren();
    if (!this.isTouch) { const k = document.createElement('kbd'); k.textContent = 'E'; h.append(k); }
    const act = STATION_ACTIONS[station.id];
    const label = act ? act.label : station.label;
    h.append(document.createTextNode(label));
    this.el.act.classList.add('ready');
  }

  renderGame(game, myHands) {
    if (!game) return;
    // para
    if (this.el.money) this.el.money.textContent = '₺' + game.money;
    if (this.el.rep) this.el.rep.textContent = '⭐ ' + game.reputation;
    if (this.el.served) this.el.served.textContent = '✅ ' + game.served + (game.failed ? ' / ❌ ' + game.failed : '');

    // stok
    if (this.el.stock) {
      const s = game.stock;
      this.el.stock.innerHTML = '';
      const items = [
        ['🥩', s.meat, 'Et'],
        ['🍞', s.bread, 'Ekmek'],
        ['🥬', s.veg, 'Malzeme'],
        ['🍟', s.fries, 'Patates'],
        ['🥤', s.drink, 'İçecek'],
        ['🔥', s.spit, 'Izgara'],
      ];
      for (const [icon, val, title] of items) {
        const span = document.createElement('span');
        span.title = title;
        span.className = val <= 1 ? 'low' : '';
        span.textContent = `${icon}${val}`;
        this.el.stock.append(span);
      }
    }

    // siparişler
    if (this.el.orders) {
      this.el.orders.innerHTML = '';
      if (!game.orders.length) {
        const empty = document.createElement('div');
        empty.className = 'ord empty';
        empty.textContent = 'Sipariş bekleniyor…';
        this.el.orders.append(empty);
      } else {
        for (const o of game.orders) {
          const d = document.createElement('div');
          d.className = 'ord';
          const pct = Math.max(0, o.patience / o.maxPatience);
          if (pct < 0.3) d.classList.add('urgent');
          else if (pct < 0.55) d.classList.add('warn');
          const needs = Object.entries(o.needs)
            .map(([k, v]) => `${v}×${ITEM_LABELS[k] || k}`)
            .join(', ');
          const table = o.tableId ? o.tableId.replace('table', 'Masa ') : '';
          const status = o.status === 'ready_pay' ? '💳 Ödeme' : '🍽️ Hazırla';
          d.innerHTML = `<b>${o.label}</b> <span class="price">₺${o.price}</span>
            <div class="needs">${table} · ${status}<br>${needs}</div>
            <div class="bar"><i style="width:${Math.round(pct * 100)}%"></i></div>`;
          if (o.status === 'ready_pay') d.classList.add('pay');
          this.el.orders.append(d);
        }
      }
    }

    // el
    if (this.el.hands) {
      this.el.hands.innerHTML = '';
      const hands = myHands || [];
      if (!hands.length) {
        this.el.hands.textContent = 'El boş';
        this.el.hands.className = 'hands empty';
      } else {
        this.el.hands.className = 'hands';
        for (const h of hands) {
          const span = document.createElement('span');
          span.textContent = ITEM_LABELS[h.type] || h.type;
          this.el.hands.append(span);
        }
      }
    }
  }

  toast(msg, ms = 2200) {
    const t = this.el.toast;
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 300);
    }, ms);
  }
}
