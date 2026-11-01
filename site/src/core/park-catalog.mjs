// 物品和落点的 ID 是存档标识；扩建时保留旧 ID 与旧价格。
export const PARK_SLOTS = [
  { id: 'lawn-west', name: '西侧草地' },
  { id: 'lawn-east', name: '东侧草地' },
  { id: 'lawn-front-left', name: '前庭左侧' },
  { id: 'lawn-front-right', name: '前庭右侧' },
  { id: 'meadow-west', name: '西边大草坪' },
  { id: 'meadow-east', name: '东边大草坪' },
  { id: 'forest-northwest', name: '林间西庭' },
  { id: 'forest-north', name: '桉树林北庭' },
  { id: 'forest-northeast', name: '林间东庭' },
  { id: 'market-east', name: '市集东侧' },
  { id: 'garden-west', name: '花园西侧' },
  { id: 'garden-east', name: '花园东侧' },
  { id: 'southwest', name: '南侧野餐地' },
  { id: 'south', name: '南侧观景地' },
  { id: 'southeast', name: '南侧花田' },
  { id: 'playground-east', name: '东南游玩地' },
];

export const TOY_CATALOG = [
  { id: 'eucalyptus-swing', name: '桉树秋千', emoji: '🎠', category: '游乐', price: 10, description: '给考拉的树梢小秋千' },
  { id: 'story-tent', name: '月光故事帐篷', emoji: '⛺', category: '休憩', price: 30, description: '读完一本书后，在帐篷里听故事' },
  { id: 'forest-tea-set', name: '森林茶点桌', emoji: '🍵', category: '休憩', price: 50, description: '邀请朋友分享一杯桉树茶' },
  { id: 'little-train', name: '旅行小火车', emoji: '🚂', category: '游乐', price: 70, description: '载着考拉去森林里看新风景' },
  { id: 'reading-bench', name: '午后阅读长椅', emoji: '🪑', category: '休憩', price: 20, description: '放一本书，在阳光下坐一会儿' },
  { id: 'flower-cart', name: '缤纷花车', emoji: '🌼', category: '花园', price: 25, description: '装满小花的木质手推车' },
  { id: 'hammock', name: '云朵吊床', emoji: '🛏️', category: '休憩', price: 35, description: '两根木桩撑起柔软的午睡时光' },
  { id: 'picnic-set', name: '森林野餐垫', emoji: '🧺', category: '休憩', price: 40, description: '格纹野餐垫、篮子和小点心' },
  { id: 'mushroom-lamp', name: '蘑菇小夜灯', emoji: '🍄', category: '花园', price: 15, description: '一大一小两朵暖黄色蘑菇' },
  { id: 'bird-bath', name: '花园饮水台', emoji: '⛲', category: '花园', price: 25, description: '给林间朋友留一汪清水' },
  { id: 'book-nook', name: '树下共享书柜', emoji: '📚', category: '花园', price: 45, description: '有小屋顶的木质户外书柜' },
  { id: 'telescope', name: '星光望远镜', emoji: '🔭', category: '游乐', price: 55, description: '面向天空的小小观星站' },
  { id: 'slide', name: '彩虹小滑梯', emoji: '🛝', category: '游乐', price: 60, description: '奶油色木架与柔和粉色滑道' },
  { id: 'music-box', name: '森林木琴', emoji: '🎵', category: '游乐', price: 35, description: '彩色琴键与两支小木槌' },
];

export const PARK_NPCS = [
  { id: 'rabbit-guide', name: '阿芽', role: '兔子向导', emoji: '🐰', position: { x: 0, z: 6 }, description: '欢迎来森林小岛！找我认识邻居，看看今天想去哪里。' },
  { id: 'fox-shopkeeper', name: '栗子', role: '狐狸店主', emoji: '🦊', position: { x: 9.1, z: -2 }, description: '新家具都摆进橱窗啦。挑一件喜欢的，把空草地变成你的角落。' },
  { id: 'owl-host', name: '咕咕', role: '猫头鹰主持人', emoji: '🦉', position: { x: -17.4, z: 10.3 }, description: '欢迎来到林间游乐场！接桉叶、翻牌或拼单词，轻松玩一局吧。' },
];
