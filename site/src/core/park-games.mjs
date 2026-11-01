import { localDayKey, validateGameState } from './playground.mjs';
import { PARK_GAMES, gameResult, initialProgress, leafScore, validRoundId } from './park-game-rules.mjs';
export { PARK_GAMES, MEMORY_SYMBOLS } from './park-game-rules.mjs';

function timestamp(value) {
  const result = new Date(value).getTime();
  if (!Number.isFinite(result) || result < 0) throw new Error('小游戏日期无效。');
  return result;
}

function entryFor(state, id) {
  return state.transactions.find((item) => item.kind === 'game-entry' && item.roundId === id);
}

export function startParkGame(state, gameId, roundId, value = new Date()) {
  validateGameState(state);
  const game = PARK_GAMES.find((item) => item.id === gameId);
  if (!game) throw new Error('没有找到这个小游戏。');
  if (!validRoundId(roundId)) throw new Error('小游戏编号无效。');
  const entry = entryFor(state, roundId);
  if (entry) {
    if (entry.gameId !== gameId) throw new Error('小游戏编号与已有记录不一致。');
    return state;
  }
  if (state.activeParkGame) throw new Error('还有一局游戏进行中，请先继续或结束这一局。');
  if (state.coins < game.price) throw new Error(`考拉币还不够，${game.name}需要 ${game.price} 枚模拟币。`);
  const now = timestamp(value);
  const updated = {
    ...state,
    coins: state.coins - game.price,
    activeParkGame: { id: roundId, gameId, cost: game.price, startedAt: now, revision: 0, progress: initialProgress(gameId, roundId) },
    parkGameHistory: state.parkGameHistory || [],
    transactions: [...state.transactions, { id: `game:${roundId}`, kind: 'game-entry', roundId, gameId,
      amount: -game.price, title: `小游戏：${game.name}`, day: localDayKey(value), createdAt: now }],
    updatedAt: now,
  };
  validateGameState(updated);
  return updated;
}

function activeRound(state, roundId) {
  if (!validRoundId(roundId)) throw new Error('小游戏编号无效。');
  if (state.activeParkGame?.id === roundId) return state.activeParkGame;
  // 收费记录比最近100局成绩保留更久，过期重试也不会再次结算或扣费。
  if (entryFor(state, roundId)) return null;
  throw new Error('没有找到这一局小游戏，请重新打开游乐场。');
}

function finish(state, round, now, abandoned) {
  return {
    ...state,
    activeParkGame: null,
    parkGameHistory: [...(state.parkGameHistory || []), { id: round.id, gameId: round.gameId, cost: round.cost,
      ...gameResult(round), startedAt: round.startedAt, finishedAt: Math.max(now, round.startedAt), abandoned }].slice(-100),
    updatedAt: now,
  };
}

export function playParkGame(state, roundId, action, value = new Date()) {
  validateGameState(state);
  const current = activeRound(state, roundId);
  if (!current) return state;
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('小游戏操作无效。');
  const progress = current.progress;
  let next;
  let complete = false;
  if (current.gameId === 'leaf-catch') {
    if (action.type !== 'catch') throw new Error('接桉叶操作无效。');
    if (action.step !== progress.step) throw new Error('这一局进度已更新，请继续最新进度。');
    if (!Number.isInteger(action.lane) || action.lane < 0 || action.lane > 2) throw new Error('请选择有效的篮子轨道。');
    const attempts = [...progress.attempts, action.lane];
    next = { ...progress, attempts, basketLane: action.lane, step: progress.step + 1, score: leafScore(progress.waves, attempts) };
    complete = next.step === 20;
  } else if (current.gameId === 'memory') {
    if (!['flip', 'clear'].includes(action.type)) throw new Error('记忆牌操作无效。');
    if (action.revision !== current.revision) throw new Error('这一局进度已更新，请继续最新进度。');
    if (action.type === 'clear') {
      if (progress.flipped.length !== 2) throw new Error('现在没有需要收起的两张牌。');
      next = { ...progress, flipped: [] };
    } else {
      if (progress.flipped.length === 2) throw new Error('请先收起未配对的两张牌。');
      if (!Number.isInteger(action.index) || action.index < 0 || action.index > 11) throw new Error('请选择有效的记忆牌。');
      if (progress.flipped.includes(action.index) || progress.matched.includes(action.index)) throw new Error('这张牌已经翻开或配对了。');
      if (progress.moves >= 10_000) throw new Error('这一局步数已达上限，请结束后开始新一局。');
      const flipped = [...progress.flipped, action.index];
      const matched = flipped.length === 2 && progress.cards[flipped[0]] === progress.cards[flipped[1]];
      next = { ...progress, flipped: matched ? [] : flipped,
        matched: matched ? [...progress.matched, ...flipped] : progress.matched,
        moves: progress.moves + Number(flipped.length === 2) };
      complete = next.matched.length === 12;
    }
  } else {
    if (action.type !== 'answer') throw new Error('单词拼写操作无效。');
    if (action.step !== progress.step) throw new Error('这一局进度已更新，请继续最新进度。');
    if (typeof action.answer !== 'string' || action.answer.length > 80) throw new Error('请输入不超过 80 个字符的答案。');
    const correct = action.answer.trim().toLowerCase() === progress.questions[progress.step].word;
    next = { ...progress, step: progress.step + 1, score: progress.score + Number(correct), answers: [...progress.answers, { answer: action.answer, correct }] };
    complete = next.step === 5;
  }
  const now = timestamp(value);
  const round = { ...current, revision: current.revision + 1, progress: next };
  const updated = complete ? finish(state, round, now, false) : { ...state, activeParkGame: round, updatedAt: now };
  validateGameState(updated);
  return updated;
}

export function abandonParkGame(state, roundId, value = new Date()) {
  validateGameState(state);
  const round = activeRound(state, roundId);
  if (!round) return state;
  const updated = finish(state, round, timestamp(value), true);
  validateGameState(updated);
  return updated;
}
