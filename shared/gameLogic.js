export const ITEM_LABELS = {
  meat: 'Döner eti',
  bread: 'Ekmek/Lavaş',
  veg: 'Malzeme',
  fries: 'Patates',
  drink: 'İçecek',
  plate: 'Tabak',
};

export const RECIPES = {
  classic: {
    id: 'classic', label: 'Klasik Döner', price: 85,
    needs: { meat: 1, bread: 1, veg: 1 }, time: 50,
  },
  double: {
    id: 'double', label: 'Duble Döner', price: 120,
    needs: { meat: 2, bread: 1, veg: 1 }, time: 55,
  },
  full: {
    id: 'full', label: 'Tam Döner Menü', price: 150,
    needs: { meat: 1, bread: 1, veg: 1, fries: 1, drink: 1 }, time: 60,
  },
  fries_only: {
    id: 'fries_only', label: 'Patates', price: 40,
    needs: { fries: 1 }, time: 35,
  },
  drink_only: {
    id: 'drink_only', label: 'İçecek', price: 25,
    needs: { drink: 1 }, time: 30,
  },
};

export const RECIPE_LIST = Object.values(RECIPES);

export const STATION_ACTIONS = {
  grill: { produce: null, label: 'Döner pişir', workMs: 1400 },
  cut: { produce: 'meat', label: 'Döner kes', workMs: 900, from: 'spit' },
  bread: { produce: 'bread', label: 'Ekmek al', workMs: 500 },
  veg: { produce: 'veg', label: 'Malzeme al', workMs: 500 },
  fryer: { produce: 'fries', label: 'Patates kızart', workMs: 1300 },
  drinks: { produce: 'drink', label: 'İçecek al', workMs: 450 },
  storage_l: { produce: null, label: 'Rafı kontrol et', workMs: 400 },
  storage_r: { produce: null, label: 'Rafı kontrol et', workMs: 400 },
  orderboard: { produce: null, label: 'Siparişlere bak', workMs: 300 },
  cashier: { produce: null, label: 'Ödeme al', workMs: 700 },
  table1: { produce: null, label: 'Masa 1', workMs: 500 },
  table2: { produce: null, label: 'Masa 2', workMs: 500 },
  table3: { produce: null, label: 'Masa 3', workMs: 500 },
};

export const MAX_STOCK = {
  meat: 16, bread: 20, veg: 20, fries: 12, drink: 14, spit: 10,
};

export const START_STOCK = {
  meat: 6, bread: 10, veg: 10, fries: 4, drink: 6, spit: 3,
};

export const CUSTOMER_SPAWN_INTERVAL = 6.5;
export const MAX_ACTIVE_ORDERS = 8;
export const MAX_CUSTOMERS = 12; // 3 masa x 4 sandalye
export const HAND_SLOTS = 4;
export const EAT_TIME = 10;

export function randomRecipe() {
  const weights = [38, 18, 22, 12, 10];
  let r = Math.random() * 100;
  for (let i = 0; i < RECIPE_LIST.length; i++) {
    r -= weights[i];
    if (r <= 0) return RECIPE_LIST[i];
  }
  return RECIPE_LIST[0];
}

export function canFulfill(stock, needs) {
  for (const [k, v] of Object.entries(needs)) {
    if ((stock[k] || 0) < v) return false;
  }
  return true;
}

export function consumeNeeds(stock, needs) {
  const next = { ...stock };
  for (const [k, v] of Object.entries(needs)) next[k] = (next[k] || 0) - v;
  return next;
}

export function emptyHands() { return []; }
export function handsCount(hands) {
  return hands.reduce((a, it) => a + (it.qty || 1), 0);
}

export const CUSTOMER_COLORS = [
  '#4a7c9b', '#8b5e3c', '#5a7a4a', '#7a4a6a', '#4a5a7a', '#9b6b3a',
  '#6b4a8b', '#3a6b6b', '#8b4a4a', '#5a5a8b',
];

export const CUSTOMER_NAMES = [
  'Ahmet', 'Ayşe', 'Mehmet', 'Fatma', 'Can', 'Zeynep', 'Emre', 'Elif',
  'Burak', 'Selin', 'Deniz', 'Cem', 'Nur', 'Kaan', 'İrem', 'Yusuf',
  'Merve', 'Oğuz', 'Seda', 'Hakan', 'Leyla', 'Berk', 'Gül', 'Onur',
  'Ceren', 'Arda', 'Pınar', 'Tolga', 'Ece', 'Barış',
];

// Rastgele müşteri lafları (canlılık)
export const AMBIENT_LINES = [
  'Kokusu müthiş!',
  'Acılı olsun lütfen…',
  'Ayran da isterim.',
  'Ne kadar sürer?',
  'Arkadaşım geliyor.',
  'Dönerci efsane burada.',
  'Bol soğanlı yapın.',
  'Hadi ya acıktım.',
  'Lavaş mı ekmek mi?',
  'Patates de gelsin.',
];
