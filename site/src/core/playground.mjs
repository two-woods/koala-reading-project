import { PARK_SLOTS, TOY_CATALOG } from './park-catalog.mjs';
import { validateParkGamesState } from './park-game-rules.mjs';
import { validateWardrobeState } from './wardrobe-rules.mjs';
import { validateAdventureState } from './park-adventure-rules.mjs';
import { validateGardenState } from './park-garden-rules.mjs';
export { PARK_SLOTS, TOY_CATALOG } from './park-catalog.mjs';

export const DAILY_CHECKIN_COINS = 10;

export const STICKER_MILESTONES = [
  { id: 'first-leaf', name: '第一片叶子', emoji: '🍃', days: 1, description: '完成第一次签到' },
  { id: 'reading-star', name: '阅读星星', emoji: '⭐', days: 3, description: '累计签到 3 天' },
  { id: 'forest-koala', name: '森林考拉', emoji: '🐨', days: 7, description: '累计签到 7 天' },
  { id: 'sunny-reader', name: '晴日读者', emoji: '🌞', days: 14, description: '累计签到 14 天' },
];

export function emptyGameState() {
  return { id: 'koala-game', coins: 0, checkInDates: [], ownedToyIds: [], transactions: [], updatedAt: Date.now() };
}

export function migrateParkScene(state, value = new Date()) {
  validateGameState(state);
  if (state.parkSceneVersion === 1) return state;
  const timestamp = new Date(value).getTime();
  const updated = {
    ...state,
    parkSceneVersion: 1,
    toyPlacements: state.toyPlacements || [],
    coins: 280,
    transactions: [...state.transactions, {
      id: 'park-scene:1', kind: 'adjustment', amount: 280 - state.coins,
      title: '乐园焕新：模拟余额调整为 280', day: localDayKey(value), createdAt: timestamp,
    }],
    updatedAt: timestamp,
  };
  validateGameState(updated);
  return updated;
}

export function placeToy(state, toyId, slotId, value = new Date()) {
  validateGameState(state);
  if (!state.ownedToyIds.includes(toyId)) throw new Error('背包里还没有这件摆设，请先在商店兑换。');
  if (slotId !== null && !PARK_SLOTS.some((slot) => slot.id === slotId)) throw new Error('请选择草地上的有效位置。');
  const placements = state.toyPlacements || [];
  if (slotId !== null && placements.some((item) => item.slotId === slotId && item.toyId !== toyId)) {
    throw new Error('这里已有摆设，请换一个位置，或先将原摆设收回背包。');
  }
  const updated = {
    ...state,
    toyPlacements: [...placements.filter((item) => item.toyId !== toyId), ...(slotId === null ? [] : [{ toyId, slotId }])],
    updatedAt: new Date(value).getTime(),
  };
  validateGameState(updated);
  return updated;
}

export function localDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('签到日期无效。');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function checkIn(state, value = new Date()) {
  validateGameState(state);
  const date = localDayKey(value);
  if (state.checkInDates.includes(date)) throw new Error('今天已经签到过了，明天再来看看吧。');
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  return {
    ...state,
    coins: state.coins + DAILY_CHECKIN_COINS,
    checkInDates: [...state.checkInDates, date],
    transactions: [...state.transactions, {
      id: `check-in:${date}`,
      kind: 'check-in',
      amount: DAILY_CHECKIN_COINS,
      title: '每日签到',
      day: date,
      createdAt: timestamp,
    }],
    updatedAt: timestamp,
  };
}

export function purchaseToy(state, toyId, value = new Date()) {
  validateGameState(state);
  const toy = TOY_CATALOG.find((item) => item.id === toyId);
  if (!toy) throw new Error('没有找到这件乐园玩具。');
  if (state.ownedToyIds.includes(toy.id)) throw new Error('这件玩具已经在你的乐园里了。');
  if (state.coins < toy.price) throw new Error('考拉币还不够，继续阅读和签到就能攒起来。');
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  return {
    ...state,
    coins: state.coins - toy.price,
    ownedToyIds: [...state.ownedToyIds, toy.id],
    transactions: [...state.transactions, {
      id: `toy:${toy.id}`,
      kind: 'purchase',
      amount: -toy.price,
      title: `兑换：${toy.name}`,
      day: localDayKey(value),
      createdAt: timestamp,
    }],
    updatedAt: timestamp,
  };
}

export function unlockedStickers(state) {
  return STICKER_MILESTONES.map((sticker) => ({
    ...sticker,
    unlocked: state.checkInDates.length >= sticker.days,
  }));
}

export function validateGameState(state) {
  const validDay = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!state || state.id !== 'koala-game' || !Number.isSafeInteger(state.coins) || state.coins < 0 || state.coins > 1_000_000_000
    || !Array.isArray(state.checkInDates) || state.checkInDates.length > 100_000
    || state.checkInDates.some((day) => !validDay(day)) || new Set(state.checkInDates).size !== state.checkInDates.length
    || !Array.isArray(state.ownedToyIds) || state.ownedToyIds.some((id) => !TOY_CATALOG.some((toy) => toy.id === id))
    || new Set(state.ownedToyIds).size !== state.ownedToyIds.length
    || !Array.isArray(state.transactions) || state.transactions.length > 100_000
    || !Number.isFinite(state.updatedAt)
    || state.transactions.some((item) => !item || typeof item.id !== 'string' || item.id.length > 200
      || !['check-in', 'purchase', 'adjustment', 'game-entry'].includes(item.kind) || !Number.isSafeInteger(item.amount)
      || typeof item.title !== 'string' || item.title.length > 200 || !validDay(item.day)
      || !Number.isFinite(item.createdAt))) {
    throw new Error('本地考拉乐园数据无效。');
  }
  if (state.parkSceneVersion !== undefined && state.parkSceneVersion !== 1) throw new Error('本地乐园版本无效。');
  if (state.toyPlacements !== undefined) {
    const placements = state.toyPlacements;
    if (!Array.isArray(placements) || placements.length > PARK_SLOTS.length
      || placements.some((item) => !item || !state.ownedToyIds.includes(item.toyId) || !PARK_SLOTS.some((slot) => slot.id === item.slotId))
      || new Set(placements.map((item) => item.toyId)).size !== placements.length
      || new Set(placements.map((item) => item.slotId)).size !== placements.length) {
      throw new Error('本地乐园布置数据无效。');
    }
  }
  validateParkGamesState(state);
  validateWardrobeState(state);
  validateAdventureState(state);
  validateGardenState(state);
  return true;
}
