// Restoran yerlesimi. Hem istemci (cizim, carpisma) hem sunucu (dogrulama) kullanir.
// Eksenler: x sag-sol, z on-arka. z = -8 arka duvar (mutfak), z = +8 on cephe (kapi).
export const BOUNDS = { minX: -12, maxX: 12, minZ: -8, maxZ: 8 };

export const ROLES = [
  { id: 'doner', label: 'Döner ustası' },
  { id: 'hazirlama', label: 'Hazırlama ustası' },
  { id: 'kasiyer', label: 'Kasiyer' },
  { id: 'servis', label: 'Servis çalışanı' },
  { id: 'yonetici', label: 'İşletme yöneticisi' },
];

// Carpisma kutulari (merkez x,z ve genislik w, derinlik d)
export const OBSTACLES = [
  { id: 'grill', x: -9, z: -6.9, w: 1.8, d: 1.4 },
  { id: 'cut', x: -6, z: -6.9, w: 2.4, d: 1.4 },
  { id: 'bread', x: -3, z: -6.9, w: 2.4, d: 1.4 },
  { id: 'veg', x: 0.5, z: -6.9, w: 3.2, d: 1.4 },
  { id: 'fryer', x: 5, z: -6.9, w: 2.2, d: 1.4 },
  { id: 'drinks', x: 9, z: -6.9, w: 1.8, d: 1.4 },
  { id: 'shelf_l', x: -11.4, z: -3.2, w: 0.9, d: 3.2 },
  { id: 'shelf_r', x: 11.4, z: -4.4, w: 0.9, d: 3.2 },
  { id: 'pass', x: -3, z: -1.5, w: 14, d: 1.0 },
  { id: 'cashier', x: 8, z: 1.6, w: 2.6, d: 1.1 },
  { id: 'table1', x: -8, z: 4.8, w: 1.5, d: 1.5 },
  { id: 'table2', x: -3, z: 4.8, w: 1.5, d: 1.5 },
  { id: 'table3', x: 3, z: 4.8, w: 1.5, d: 1.5 },
  { id: 'bench', x: 9.6, z: 6.4, w: 3.2, d: 1.0 },
];

// Etkilesim noktalari: oyuncu bu noktanin yaricapi icindeyken E / buton ile calisir.
export const STATIONS = [
  { id: 'grill', label: 'Döner ocağı', x: -9, z: -4.8, r: 1.7 },
  { id: 'cut', label: 'Döner kesme tezgâhı', x: -6, z: -4.8, r: 1.7 },
  { id: 'bread', label: 'Ekmek / lavaş', x: -3, z: -4.8, r: 1.7 },
  { id: 'veg', label: 'Malzeme istasyonu', x: 0.5, z: -4.8, r: 1.9 },
  { id: 'orderboard', label: 'Sipariş panosu', x: 3, z: -4.8, r: 1.3 },
  { id: 'fryer', label: 'Patates kızartma', x: 5.2, z: -4.8, r: 1.6 },
  { id: 'drinks', label: 'İçecek dolabı', x: 9, z: -4.8, r: 1.7 },
  { id: 'storage_l', label: 'Depo rafı', x: -9.8, z: -2.9, r: 1.3 },
  { id: 'storage_r', label: 'Depo rafı', x: 10, z: -2.9, r: 1.3 },
  { id: 'cashier', label: 'Kasa', x: 8, z: 0.2, r: 1.7 },
];

export const SPAWN_POINTS = [
  { x: -4, z: 1.8 }, { x: -2, z: 1.8 }, { x: 0, z: 1.8 },
  { x: 2, z: 1.8 }, { x: 4, z: 1.8 }, { x: -6, z: 1.8 },
];

export const DOOR = { x: 0, z: 8, halfWidth: 1.6 };
