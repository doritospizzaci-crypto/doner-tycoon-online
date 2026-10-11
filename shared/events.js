export const C2S = {
  CREATE: 'room:create',
  JOIN: 'room:join',
  LEAVE: 'room:leave',
  MOVE: 'player:move',
  ROLE: 'player:role',
  INTERACT: 'player:interact',
  CHAT: 'chat:send',
  DROP: 'player:drop', // elindeki ürünü bırak / çöpe at
};

export const S2C = {
  ROOM: 'room:state',
  NOTICE: 'room:notice',
  PLAYERS: 'state:players',
  CORRECT: 'player:correct',
  ACTION: 'player:action',
  CHAT: 'chat:msg',
  GAME: 'game:state',       // para, stok, siparişler, müşteriler
  SERVE: 'game:serve',      // sipariş teslim edildi
  FAIL: 'game:fail',        // müşteri kaçtı / başarısız
  TIP: 'game:tip',          // bahşiş / ödül
};
