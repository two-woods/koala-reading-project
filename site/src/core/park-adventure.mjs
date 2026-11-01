import { validateGameState } from './playground.mjs';
import { getAdventure, PARK_SECRETS } from './park-adventure-rules.mjs';

export function discoverParkSecret(game, id, value = new Date()) {
  validateGameState(game);
  if (!PARK_SECRETS.some((item) => item.id === id)) throw new Error('没有找到这个森林彩蛋。');
  const adventure = getAdventure(game);
  if (adventure.foundIds.includes(id)) return game;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('探索时间无效。');
  adventure.foundIds.push(id);
  const updated = { ...game, adventure, updatedAt: timestamp };
  validateGameState(updated);
  return updated;
}
