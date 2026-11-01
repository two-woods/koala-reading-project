export const PARK_GAMES = [
  { id: 'leaf-catch', name: '接桉叶', emoji: '🍃', price: 3, description: '移动小篮子，接住飘落的桉叶，躲开小树枝。', rules: '每局 20 次掉落。接住桉叶 +1 分，接到树枝 −1 分，最低 0 分，最高 16 分。开始时花费 3 枚模拟币。' },
  { id: 'memory', name: '森林记忆牌', emoji: '🍄', price: 3, description: '翻开森林小卡片，找齐六对相同图案。', rules: '12 张牌共 6 对；每翻开第二张计 1 步。找到全部配对完成，步数越少越好。开始时花费 3 枚模拟币。' },
  { id: 'word-spell', name: '单词小邮局', emoji: '✉️', price: 2, description: '看中文和句子线索，给森林朋友送出五个英文单词。', rules: '每局 5 题，答对一题 +1 分。忽略大小写和首尾空白，其余拼写须一致。开始时花费 2 枚模拟币。' },
];

export const MEMORY_SYMBOLS = { leaf: '🍃', flower: '🌸', apple: '🍎', star: '⭐', moon: '🌙', mushroom: '🍄' };

const WORD_BANK = [
  { word: 'forest', meaning: '森林', hint: 'Many trees grow in the ______.' },
  { word: 'garden', meaning: '花园', hint: 'We plant flowers in the ______.' },
  { word: 'friend', meaning: '朋友', hint: 'My ______ likes to play with me.' },
  { word: 'basket', meaning: '篮子', hint: 'Put the apples in the ______.' },
  { word: 'flower', meaning: '花', hint: 'A pink ______ grows beside the path.' },
  { word: 'island', meaning: '岛屿', hint: 'Water surrounds the small ______.' },
  { word: 'window', meaning: '窗户', hint: 'Open the ______ to let in fresh air.' },
  { word: 'sunny', meaning: '晴朗的', hint: 'It is a warm and ______ day.' },
  { word: 'quiet', meaning: '安静的', hint: 'The library is a ______ place.' },
  { word: 'little', meaning: '小的', hint: 'The ______ bird sits on a branch.' },
  { word: 'green', meaning: '绿色的', hint: 'The leaves are ______ in summer.' },
  { word: 'story', meaning: '故事', hint: 'Read me a ______ before bedtime.' },
];

export const validRoundId = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const timestamp = (value) => Number.isFinite(value) && value >= 0 && value <= 8_640_000_000_000_000;
const fail = () => { throw new Error('本地小游戏数据无效。'); };

function randomFor(id) {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function initialProgress(gameId, roundId) {
  const random = randomFor(roundId);
  if (gameId === 'leaf-catch') return {
    waves: Array.from({ length: 20 }, (_, index) => ({ lane: Math.floor(random() * 3), kind: index % 5 === 4 ? 'branch' : 'leaf' })),
    step: 0, score: 0, basketLane: 1, attempts: [],
  };
  if (gameId === 'memory') return { cards: shuffle([...Object.keys(MEMORY_SYMBOLS), ...Object.keys(MEMORY_SYMBOLS)], random), matched: [], flipped: [], moves: 0 };
  if (gameId === 'word-spell') return { questions: shuffle(WORD_BANK, random).slice(0, 5).map((question) => ({ ...question })), step: 0, score: 0, answers: [] };
  throw new Error('没有找到这个小游戏。');
}

export function leafScore(waves, attempts) {
  return attempts.reduce((score, lane, index) => lane === waves[index].lane ? Math.max(0, score + (waves[index].kind === 'leaf' ? 1 : -1)) : score, 0);
}

export function gameResult(round) {
  if (round.gameId === 'memory') return { score: round.progress.matched.length / 2, maxScore: 6, moves: round.progress.moves };
  return { score: round.progress.score, maxScore: round.gameId === 'leaf-catch' ? 16 : 5, moves: round.progress.step };
}

function validateProgress(round) {
  const progress = round.progress;
  if (!progress || typeof progress !== 'object' || Array.isArray(progress) || !integer(round.revision, 0, 30_001)) fail();
  const expected = initialProgress(round.gameId, round.id);
  if (round.gameId === 'leaf-catch') {
    if (!Array.isArray(progress.waves) || progress.waves.length !== 20
      || progress.waves.some((wave, index) => !wave || wave.lane !== expected.waves[index].lane || wave.kind !== expected.waves[index].kind)
      || !integer(progress.step, 0, 19) || round.revision !== progress.step
      || !Array.isArray(progress.attempts) || progress.attempts.length !== progress.step || progress.attempts.some((lane) => !integer(lane, 0, 2))
      || progress.basketLane !== (progress.attempts.at(-1) ?? 1)
      || progress.score !== leafScore(progress.waves, progress.attempts)) fail();
  } else if (round.gameId === 'memory') {
    if (!Array.isArray(progress.cards) || progress.cards.length !== 12 || progress.cards.some((card, index) => card !== expected.cards[index])
      || !Array.isArray(progress.matched) || progress.matched.length > 10 || progress.matched.length % 2
      || progress.matched.some((index) => !integer(index, 0, 11)) || new Set(progress.matched).size !== progress.matched.length
      || !Array.isArray(progress.flipped) || progress.flipped.length > 2
      || progress.flipped.some((index) => !integer(index, 0, 11) || progress.matched.includes(index)) || new Set(progress.flipped).size !== progress.flipped.length
      || !integer(progress.moves, 0, 10_000)) fail();
    const counts = new Map();
    for (const index of progress.matched) counts.set(progress.cards[index], (counts.get(progress.cards[index]) || 0) + 1);
    const pairs = progress.matched.length / 2;
    const mismatch = progress.flipped.length === 2;
    if ([...counts.values()].some((count) => count !== 2)
      || (mismatch && progress.cards[progress.flipped[0]] === progress.cards[progress.flipped[1]])
      || progress.moves < pairs + Number(mismatch)
      || round.revision !== 3 * progress.moves - pairs - Number(mismatch) + Number(progress.flipped.length === 1)) fail();
  } else {
    if (!Array.isArray(progress.questions) || progress.questions.length !== 5
      || progress.questions.some((question, index) => !question || ['word', 'meaning', 'hint'].some((key) => question[key] !== expected.questions[index][key]))
      || !integer(progress.step, 0, 4) || round.revision !== progress.step
      || !Array.isArray(progress.answers) || progress.answers.length !== progress.step
      || progress.answers.some((answer, index) => !answer || typeof answer.answer !== 'string' || answer.answer.length > 80
        || answer.correct !== (answer.answer.trim().toLowerCase() === progress.questions[index].word))
      || progress.score !== progress.answers.filter((answer) => answer.correct).length) fail();
  }
}

// 本机存档的结构与一致性校验；模拟币不代表服务器积分或真实奖励。
export function validateParkGamesState(state) {
  const entries = state.transactions.filter((item) => item.kind === 'game-entry');
  const entryMap = new Map();
  for (const entry of entries) {
    const game = PARK_GAMES.find((item) => item.id === entry.gameId);
    if (!game || !validRoundId(entry.roundId) || entry.id !== `game:${entry.roundId}` || !integer(-entry.amount, 1, 1_000_000)
      || !timestamp(entry.createdAt) || entryMap.has(entry.roundId)) fail();
    entryMap.set(entry.roundId, entry);
  }
  const history = state.parkGameHistory === undefined ? [] : state.parkGameHistory;
  if (!Array.isArray(history) || history.length > 100) fail();
  const seen = new Set();
  const validateRound = (round) => {
    const game = round && PARK_GAMES.find((item) => item.id === round.gameId);
    const entry = round && entryMap.get(round.id);
    // 每局使用开局时的价格快照，未来调价不应使已保存的游戏失效。
    if (!game || !validRoundId(round.id) || !timestamp(round.startedAt)
      || !entry || round.cost !== -entry.amount || entry.gameId !== round.gameId || entry.createdAt !== round.startedAt || seen.has(round.id)) fail();
    seen.add(round.id);
  };
  for (const result of history) {
    validateRound(result);
    const maxScore = result.gameId === 'leaf-catch' ? 16 : result.gameId === 'memory' ? 6 : 5;
    const maxMoves = result.gameId === 'leaf-catch' ? 20 : result.gameId === 'memory' ? 10_000 : 5;
    if (!timestamp(result.finishedAt) || result.finishedAt < result.startedAt || typeof result.abandoned !== 'boolean'
      || result.maxScore !== maxScore || !integer(result.score, 0, maxScore) || !integer(result.moves, 0, maxMoves)
      || result.score > result.moves || (!result.abandoned && (result.gameId === 'memory' ? result.score !== 6 : result.moves !== maxMoves))) fail();
  }
  if (state.activeParkGame !== undefined && state.activeParkGame !== null) {
    validateRound(state.activeParkGame);
    validateProgress(state.activeParkGame);
  }
  return true;
}
