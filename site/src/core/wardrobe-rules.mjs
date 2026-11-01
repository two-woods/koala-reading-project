export const WARDROBE_SLOTS = [
  { id: 'outfit', name: '衣服' }, { id: 'headwear', name: '帽饰' }, { id: 'makeup', name: '妆容' },
];

export const WARDROBE_CATALOG = [
  { id: 'forest-original', slot: 'outfit', name: '桉叶围巾', price: 0, color: '#7d9662', description: '最熟悉的模样，轻轻松松去散步。' },
  { id: 'cream-vest', slot: 'outfit', name: '奶油针织背心', price: 0, color: '#e6d6b4', description: '柔软的奶油色，配上原来的小围巾。' },
  { id: 'trail-runner', slot: 'outfit', name: '清爽越野跑背心', price: 0, color: '#e47758', description: '考拉大王的山野装备：补水背包、双软水壶，别好 KOALA 01 号码布就出发。' },
  { id: 'peach-vest', slot: 'outfit', name: '蜜桃针织背心', price: 35, color: '#da9690', description: '一抹暖暖的桃粉，口袋里装着好心情。' },
  { id: 'sky-vest', slot: 'outfit', name: '晴空针织背心', price: 40, color: '#8eafc6', description: '把晴天穿在身上，去小岛逛一圈。' },
  { id: 'no-headwear', slot: 'headwear', name: '不戴帽饰', price: 0, color: '#b5b8b2', description: '露出圆圆的耳朵，感受森林的风。' },
  { id: 'trail-visor', slot: 'headwear', name: '越野跑遮阳帽', price: 0, color: '#e47758', description: '奶油色帽檐、珊瑚色帽带，跑起来也露着圆圆的耳朵。' },
  { id: 'leaf-beret', slot: 'headwear', name: '森林贝雷帽', price: 25, color: '#718b61', description: '一顶小圆帽，别着新鲜的桉叶。' },
  { id: 'flower-clip', slot: 'headwear', name: '小雏菊发饰', price: 20, color: '#e3c574', description: '耳边开了一朵小小的花。' },
  { id: 'natural', slot: 'makeup', name: '素颜', price: 0, color: '#bfc2bd', description: '保留考拉本来的可爱模样。' },
  { id: 'peach-blush', slot: 'makeup', name: '蜜桃腮红', price: 0, color: '#e9979e', description: '两团轻柔的粉，像刚晒过太阳。' },
  { id: 'star-freckles', slot: 'makeup', name: '星星雀斑', price: 15, color: '#d5aa53', description: '腮边点点金色星光。' },
  { id: 'lavender-eyeshadow', slot: 'makeup', name: '薰衣草眼妆', price: 20, color: '#aa90c5', description: '眼角一抹浅紫，温柔又俏皮。' },
];

const freeIds = WARDROBE_CATALOG.filter((item) => item.price === 0).map((item) => item.id);
// 第一版的五件赠品是存档必需项；后续赠品读取时补齐，兼容原有合法存档。
const requiredFreeIds = ['forest-original', 'cream-vest', 'no-headwear', 'natural', 'peach-blush'];
const defaults = { outfit: 'forest-original', headwear: 'no-headwear', makeup: 'natural' };

export function getWardrobe(state) {
  const saved = state.wardrobe;
  return saved
    ? { version: 1, ownedIds: [...saved.ownedIds, ...freeIds.filter((id) => !saved.ownedIds.includes(id))], equipped: { ...saved.equipped } }
    : { version: 1, ownedIds: [...freeIds], equipped: { ...defaults } };
}

export function validateWardrobeState(state) {
  const fail = () => { throw new Error('本地衣橱装扮数据无效。'); };
  const receipts = state.transactions.filter((tx) => tx.id.startsWith('wardrobe:'));
  if (state.wardrobe === undefined) {
    if (receipts.length) fail();
    return;
  }
  const saved = state.wardrobe;
  if (!saved || saved.version !== 1 || !Array.isArray(saved.ownedIds)
    || saved.ownedIds.length > WARDROBE_CATALOG.length
    || saved.ownedIds.some((id) => !WARDROBE_CATALOG.some((item) => item.id === id))
    || new Set(saved.ownedIds).size !== saved.ownedIds.length
    || requiredFreeIds.some((id) => !saved.ownedIds.includes(id))
    || !saved.equipped || Object.keys(saved.equipped).length !== WARDROBE_SLOTS.length
    || WARDROBE_SLOTS.some((slot) => !saved.ownedIds.includes(saved.equipped[slot.id])
      || !WARDROBE_CATALOG.some((item) => item.id === saved.equipped[slot.id] && item.slot === slot.id))) fail();
  const paid = WARDROBE_CATALOG.filter((item) => item.price > 0 && saved.ownedIds.includes(item.id));
  if (receipts.length !== paid.length || new Set(receipts.map((tx) => tx.id)).size !== receipts.length
    || receipts.some((tx) => !paid.some((item) => tx.id === `wardrobe:${item.id}` && tx.kind === 'purchase' && tx.amount === -item.price))) fail();
}
