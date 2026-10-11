// Paylaşılan oyun sabitleri ve tarifler. İstemci + sunucu aynı dosyayı kullanır.

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
    id: 'classic',
    label: 'Klasik Döner',
    price: 85,
    needs: { meat: 1, bread: 1, veg: 1 },
    time: 55,
  },
  double: {
    id: 'double',
    label: 'Duble Döner',
    price: 120,
    needs: { meat: 2, bread: 1, veg: 1 },
    time: 60,
  },
  full: {
    id: 'full',
    label: 'Tam Döner Menü',
    price: 150,
    needs: { meat: 1, bread: 1, veg: 1, fries: 1, drink: 1 },
    time: 65,
  },
  fries_only: {
    id: 'fries_only',
    label: 'Patates',
    price: 40,
    needs: { fries: 1 },
    time: 40,
  },
  drink_only: {
    id: 'drink_only',
    label: 'İçecek',
    price: 25,
    needs: { drink: 1 },
    time: 35,
  },
};

export const RECIPE_LIST = Object.values(RECIPES);

export const STATION_ACTIONS = {
  grill: { produce: null, label: 'Döner pişir', workMs: 1800 },
  cut: { produce: 'meat', label: 'Döner kes', workMs: 1200, from: 'spit' },
  bread: { produce: 'bread', label: 'Ekmek al', workMs: 700 },
  veg: { produce: 'veg', label: 'Malzeme al', workMs: 700 },
  fryer: { produce: 'fries', label: 'Patates kızart', workMs: 1600 },
  drinks: { produce: 'drink', label: 'İçecek al', workMs: 600 },
  storage_l: { produce: null, label: 'Rafı kontrol et', workMs: 500 },
  storage_r: { produce: null, label: 'Rafı kontrol et', workMs: 500 },
  orderboard: { produce: null, label: 'Siparişlere bak', workMs: 400 },
  cashier: { produce: null, label: 'Ödeme al', workMs: 900 },
  table1: { produce: null, label: 'Masa 1', workMs: 600 },
  table2: { produce: null, label: 'Masa 2', workMs: 600 },
  table3: { produce: null, label: 'Masa 3', workMs: 600 },
};

export const MAX_STOCK = {
  meat: 12,
  bread: 16,
  veg: 16,
  fries: 10,
  drink: 12,
  spit: 8,
};

export const START_STOCK = {
  meat: 4,
  bread: 8,
  veg: 8,
  fries: 3,
  drink: 5,
  spit: 2,
};

export const CUSTOMER_SPAWN_INTERVAL = 10;
export const MAX_ACTIVE_ORDERS = 3;
export const MAX_CUSTOMERS = 3; // masa sayısı kadar
export const HAND_SLOTS = 3;
export const EAT_TIME = 12; // yemek yeme süresi (sn)

export function randomRecipe() {
  const weights = [40, 20, 25, 10, 5];
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

export function emptyHands() {
  return [];
}

export function handsCount(hands) {
  return hands.reduce((a, it) => a + (it.qty || 1), 0);
}

export const CUSTOMER_COLORS = ['#4a7c9b', '#8b5e3c', '#5a7a4a', '#7a4a6a', '#4a5a7a', '#9b6b3a'];
export const CUSTOMER_NAMES = [
  'Ahmet', 'Ayşe', 'Mehmet', 'Fatma', 'Can', 'Zeynep', 'Emre', 'Elif',
  'Burak', 'Selin', 'Deniz', 'Cem', 'Nur', 'Kaan', 'İrem', 'Yusuf',
  'Merve', 'Oğuz', 'Seda', 'Hakan', 'Leyla', 'Berk', 'Gül', 'Onur',
];
