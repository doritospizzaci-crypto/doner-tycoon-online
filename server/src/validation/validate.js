import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, NAME_MAX, CHAT_MAX } from '../../../shared/constants.js';
import { ROLES } from '../../../shared/layout.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g;
const ROLE_IDS = new Set(ROLES.map((r) => r.id));

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function cleanText(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > max) return null;
  return s;
}

export const validName = (v) => cleanText(v, NAME_MAX);
export const validChat = (v) => cleanText(v, CHAT_MAX);
export const validToken = (v) => typeof v === 'string' && TOKEN_RE.test(v);
export const validRole = (v) => typeof v === 'string' && ROLE_IDS.has(v);

export function validRoomCode(v) {
  if (typeof v !== 'string') return null;
  const code = v.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function validMove(m) {
  if (!isObject(m)) return null;
  const { x, z, r } = m;
  if (![x, z, r].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (Math.abs(x) > 100 || Math.abs(z) > 100) return null;
  return { x, z, r: ((r % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) };
}
