import { localDayKey, validateGameState } from './playground.mjs';
import { getWardrobe, WARDROBE_CATALOG } from './wardrobe-rules.mjs';

function findItem(id) {
  const item = WARDROBE_CATALOG.find((entry) => entry.id === id);
  if (!item) throw new Error('没有找到这件装扮。');
  return item;
}

export function purchaseWearable(state, itemId, value = new Date()) {
  validateGameState(state);
  const item = findItem(itemId);
  const wardrobe = getWardrobe(state);
  if (wardrobe.ownedIds.includes(itemId)) return state;
  if (state.coins < item.price) throw new Error('考拉币还不够，签到可以慢慢攒起来。');
  const day = localDayKey(value);
  const timestamp = new Date(value).getTime();
  wardrobe.ownedIds.push(itemId);
  const updated = {
    ...state, coins: state.coins - item.price, wardrobe, updatedAt: timestamp,
    transactions: [...state.transactions, {
      id: `wardrobe:${item.id}`, kind: 'purchase', amount: -item.price,
      title: `装扮：${item.name}`, day, createdAt: timestamp,
    }],
  };
  validateGameState(updated);
  return updated;
}

export function equipWearable(state, itemId, value = new Date()) {
  validateGameState(state);
  const item = findItem(itemId);
  const wardrobe = getWardrobe(state);
  if (!wardrobe.ownedIds.includes(itemId)) throw new Error('还未拥有这件装扮，请先购买。');
  if (wardrobe.equipped[item.slot] === itemId) return state;
  localDayKey(value);
  wardrobe.equipped[item.slot] = itemId;
  const updated = { ...state, wardrobe, updatedAt: new Date(value).getTime() };
  validateGameState(updated);
  return updated;
}
