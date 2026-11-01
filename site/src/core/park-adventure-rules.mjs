export const PARK_SECRETS = [
  { id: 'translator-desk', name: '大王的第 100 份译稿', emoji: '📖', theme: 'translation', position: { x: -14.8, z: -6.6 }, approach: { x: -14, z: -4.7 }, hint: '树屋西侧，有一盏还亮着的工作灯。', quote: 'Words build bridges.', translation: '文字搭起桥梁。', story: '字典被翻得卷了边，译稿上却画着一座小桥。考拉大王说：我最喜欢的工作，是让原本听不懂彼此的朋友，终于聊到一起。桌上的第 100 份译稿，是松鼠写给远方朋友的生日信。' },
  { id: 'forest-letter', name: '寄给森林翻译官的信', emoji: '✉️', theme: 'translation', position: { x: -23, z: -6.8 }, approach: { x: -21.6, z: -5.5 }, hint: '西边桉树林里，红色的小旗正在等一封信。', quote: 'There is no place like home.', translation: '没有哪里比家更温暖。', story: '邮筒里躺着一封双语明信片：“亲爱的考拉大王，谢谢你把我的想念翻译给妈妈。”大王没有收翻译费，只在回信里画了一片桉叶——森林的邮票。' },
  { id: 'idiom-radio', name: '电台里那句奇怪的祝福', emoji: '📻', theme: 'translation', position: { x: 3.2, z: -10.9 }, approach: { x: 4.2, z: -9.6 }, hint: '市集后面的老电台，正在播一条赛前祝福。', quote: 'Break a leg!', translation: '祝你好运！', story: '咕咕听见这句英语，差点取消越野赛。考拉大王笑着解释：这是一句祝人演出成功的习惯用语。翻译要听懂语境；要上场表演的朋友，收到的其实是一份祝福。' },
  { id: 'tiny-crown', name: '一顶没有架子的王冠', emoji: '👑', theme: 'translation', position: { x: 1, z: -17.8 }, approach: { x: 1, z: -16.5 }, hint: '北边的桉叶下，藏着一件小小的金色物品。', quote: 'A good translator listens first.', translation: '好的译者，先学会倾听。', story: '“考拉大王”是邻居们送的昵称。那次森林大会，大王把每一位居民的意见都认真翻译了一遍。大家用桉叶给它编了王冠；大王却把王冠放在树下，说：先听听最小的声音。' },
  { id: 'trail-start', name: '号码布 KOALA 01', emoji: '🏁', theme: 'trail', position: { x: 18, z: 9.5 }, approach: { x: 18, z: 9.5 }, hint: '东南边的林间小门，挂着一块特别的号码布。', quote: 'Run your own race.', translation: '跑自己的节奏。', story: '号码布上的 01，并不表示第一名。那是考拉大王的第一场越野跑：它花了很久，也停下来看了好多次风景。它最喜欢的成绩，是“平安回来，还想再跑一次”。' },
  { id: 'banana-aid', name: '留给最后一位跑者的香蕉', emoji: '🍌', theme: 'trail', position: { x: 22, z: -6.8 }, approach: { x: 20.5, z: -5.5 }, hint: '东边的遮阳棚下，有人留了一份黄色补给。', quote: 'One sip, one step.', translation: '喝一口水，再往前一步。', story: '栗子把最后一根香蕉藏在补给桌下，纸条上写着：留给最后到站的朋友。考拉大王当翻译官时照顾每一种声音，跑山时也等着每一个伙伴。它给水壶贴了一个小皇冠。' },
  { id: 'summit-bell', name: '远山寄来的风', emoji: '🔔', theme: 'trail', position: { x: 14, z: -14.2 }, approach: { x: 14, z: -12.4 }, hint: '东北边面向远山的木架上，风会替你敲铃。', quote: 'The best view comes after the climb.', translation: '翻过山，才遇到最好的风景。', story: '大王从不把登顶当作唯一的目标。山风、脚下的落叶、一起出发的朋友，也都值得停下。观景铃响起时，它会在跑步手账里写：今天又多认识了一点世界。' },
  { id: 'muddy-shoes', name: '一双不肯洗干净的鞋', emoji: '👟', theme: 'trail', position: { x: -20.2, z: 12.8 }, approach: { x: -19, z: 12 }, hint: '西南边小路尽头，留下了两串快乐的泥脚印。', quote: 'Leave only footprints.', translation: '只留下脚印。', story: '阿芽问：大王，你的鞋怎么总有泥？大王说：那是今天去过森林的证据。它会把路上的垃圾装进小背包带走，让下一位跑者也能遇见干净的风景。' },
];

export const ADVENTURE_OBSTACLES = [
  { x: -14.8, z: -6.6, width: 2.2, depth: 1.6 },
  { x: -23, z: -6.8, radius: .6 },
  { x: 3.2, z: -10.9, radius: .6 },
  { x: 1, z: -17.8, radius: .45 },
  { x: 16.45, z: 9.5, radius: .14 }, { x: 19.55, z: 9.5, radius: .14 },
  { x: 22, z: -6.8, width: 2, depth: 1.2 },
  { x: 14, z: -14.2, radius: .55 },
  { x: -20.2, z: 12.8, radius: .6 },
];

export const TRAIL_ROUTE = [
  { x: 18, z: 9.5, secretId: 'trail-start' },
  { x: 20.5, z: -5.5, secretId: 'banana-aid' },
  { x: 14, z: -12.4, secretId: 'summit-bell' },
  { x: 5, z: -12 }, { x: -18, z: -12 }, { x: -21, z: 2 },
  { x: -19, z: 12, secretId: 'muddy-shoes' },
  { x: 0, z: 11.5 }, { x: 18, z: 9.5 },
];

export function getAdventure(game) {
  return { version: 1, foundIds: [...(game.adventure?.foundIds || [])] };
}

export function adventureTitles(game) {
  const found = new Set(getAdventure(game).foundIds);
  const complete = (theme) => PARK_SECRETS.filter((item) => item.theme === theme).every((item) => found.has(item.id));
  return [
    { id: 'translator', name: '森林译者', unlocked: complete('translation'), requirement: '发现全部 4 个翻译故事' },
    { id: 'runner', name: '山野跑者', unlocked: complete('trail'), requirement: '发现全部 4 个越野故事' },
    { id: 'king', name: '读山阅海的考拉大王', unlocked: PARK_SECRETS.every((item) => found.has(item.id)), requirement: '集齐 8 个森林彩蛋' },
  ];
}

export function validateAdventureState(game) {
  if (game.adventure === undefined) return;
  const value = game.adventure;
  if (!value || value.version !== 1 || !Array.isArray(value.foundIds) || value.foundIds.length > PARK_SECRETS.length
    || value.foundIds.some((id) => !PARK_SECRETS.some((item) => item.id === id))
    || new Set(value.foundIds).size !== value.foundIds.length) throw new Error('本地探索手账数据无效。');
}
