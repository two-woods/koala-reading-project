export const FLOWER_CATALOG = [
  { id: 'daisy', name: '雏菊', english: 'Daisy', emoji: '🌼', color: '#fff0d1', description: '奶油白的花瓣，围着一颗暖黄色的小太阳。' },
  { id: 'tulip', name: '郁金香', english: 'Tulip', emoji: '🌷', color: '#d99095', description: '柔粉色的花杯，在微风里轻轻点头。' },
  { id: 'lavender', name: '薰衣草', english: 'Lavender', emoji: '🪻', color: '#a392c2', description: '一簇簇淡紫花穗，把安静留在花园里。' },
  { id: 'sunflower', name: '向日葵', english: 'Sunflower', emoji: '🌻', color: '#e7bd62', description: '高高举起金黄花盘，陪大王一起迎着光。' },
];

// 内部 ID 沿用旧花畦，让已种的花与浇水记录自然接入新布局。
export const GARDEN_BEDS = [
  { id: 'west-1', name: '晨光花丛', position: { x: -2.35, z: -3 }, approach: { x: -.4, z: -3 }, width: 2.65, depth: 1.85, radius: .95 },
  { id: 'east-1', name: '入口花丛', position: { x: 2.65, z: -4.25 }, approach: { x: .4, z: -4.4 }, width: 2.6, depth: 2, radius: .95 },
  { id: 'west-2', name: '窗边花丛', position: { x: -2.35, z: -5.95 }, approach: { x: -.35, z: -5.9 }, width: 2.45, depth: 2.2, radius: .95 },
  { id: 'east-2', name: '微风花丛', position: { x: 2.8, z: -6.85 }, approach: { x: .55, z: -7.2 }, width: 2.85, depth: 2.15, radius: 1 },
  { id: 'west-3', name: '树影花丛', position: { x: -2.25, z: -8.85 }, approach: { x: -.05, z: -8.7 }, width: 2.75, depth: 2, radius: .95 },
  { id: 'east-3', name: '林边花丛', position: { x: 1.9, z: -9.25 }, approach: { x: -.05, z: -8.7 }, width: 2.45, depth: 1.7, radius: .85 },
];
export const GARDEN_PATH_POINTS = [
  { x: 0, z: -1.65 }, { x: -.4, z: -3 }, { x: .4, z: -4.4 },
  { x: -.35, z: -5.9 }, { x: .55, z: -7.2 }, { x: -.05, z: -8.7 }, { x: .05, z: -10.5 },
];
export const GARDEN_ENTRANCE = GARDEN_PATH_POINTS[0];
export const GARDEN_BOUNDS = { x: .3, z: -6, width: 8.2, depth: 9 };
export const GARDEN_OBSTACLES = GARDEN_BEDS.map((bed) => ({ ...bed.position, radius: bed.radius }));
export const GARDEN_MOISTURE_MS = 30 * 60 * 1000;

const validTimestamp = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;

export function getGarden(game) {
  return { version: 1, beds: (game?.garden?.beds || []).map(({ id, flowerId, plantedAt, wateredAt }) => ({ id, flowerId, plantedAt, wateredAt })) };
}

export function isGardenBedWet(bed, now = Date.now()) {
  return validTimestamp(now) && validTimestamp(bed?.wateredAt)
    && now >= bed.wateredAt && now - bed.wateredAt < GARDEN_MOISTURE_MS;
}

export function validateGardenState(game) {
  if (game.garden === undefined) return;
  const value = game.garden;
  if (!value || Array.isArray(value) || value.version !== 1 || !Array.isArray(value.beds) || value.beds.length > GARDEN_BEDS.length
    || value.beds.some((bed) => !bed || Array.isArray(bed)
      || !GARDEN_BEDS.some((item) => item.id === bed.id)
      || !FLOWER_CATALOG.some((flower) => flower.id === bed.flowerId)
      || !validTimestamp(bed.plantedAt)
      || (bed.wateredAt !== null && (!validTimestamp(bed.wateredAt) || bed.wateredAt < bed.plantedAt)))
    || new Set(value.beds.map((bed) => bed.id)).size !== value.beds.length) {
    throw new Error('本地花园数据无效。');
  }
}
