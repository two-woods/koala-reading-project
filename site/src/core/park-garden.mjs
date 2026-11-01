import { validateGameState } from './playground.mjs';
import { FLOWER_CATALOG, GARDEN_BEDS, getGarden } from './park-garden-rules.mjs';

function gardenTimestamp(value) {
  const timestamp = value instanceof Date || typeof value === 'string' || typeof value === 'number'
    ? new Date(value).getTime() : NaN;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0
    || (typeof value === 'number' && !Number.isSafeInteger(value))) throw new Error('花园照料时间无效。');
  return timestamp;
}

function checkBed(bedId) {
  if (!GARDEN_BEDS.some((bed) => bed.id === bedId)) throw new Error('请选择花园中的种植位置。');
}

export function plantGardenFlower(game, bedId, flowerId, value = new Date()) {
  validateGameState(game);
  checkBed(bedId);
  if (!FLOWER_CATALOG.some((flower) => flower.id === flowerId)) throw new Error('请选择花园中提供的花种。');
  const timestamp = gardenTimestamp(value);
  const garden = getGarden(game);
  const existing = garden.beds.find((bed) => bed.id === bedId);
  if (existing?.flowerId === flowerId) return game;
  const planted = { id: bedId, flowerId, plantedAt: timestamp, wateredAt: null };
  if (existing) garden.beds[garden.beds.indexOf(existing)] = planted;
  else garden.beds.push(planted);
  const updated = { ...game, garden, updatedAt: timestamp };
  validateGameState(updated);
  return updated;
}

export function waterGardenBed(game, bedId, value = new Date()) {
  validateGameState(game);
  checkBed(bedId);
  const timestamp = gardenTimestamp(value);
  const garden = getGarden(game);
  const bed = garden.beds.find((item) => item.id === bedId);
  if (!bed) throw new Error('这里还没有种花，先选一种喜欢的花种下吧。');
  if (timestamp < bed.plantedAt || (bed.wateredAt !== null && timestamp < bed.wateredAt)) throw new Error('花园照料时间无效，请稍后再试。');
  if (bed.wateredAt === timestamp) return game;
  bed.wateredAt = timestamp;
  const updated = { ...game, garden, updatedAt: timestamp };
  validateGameState(updated);
  return updated;
}
