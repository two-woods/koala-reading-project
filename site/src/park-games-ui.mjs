import { escapeHtml } from './core/content.mjs';
import { PARK_GAMES, startParkGame, playParkGame, abandonParkGame } from './core/park-games.mjs';

const text = (value) => escapeHtml(value ?? '');
const symbols = { leaf: '🍃', flower: '🌸', apple: '🍎', star: '⭐', moon: '🌙', mushroom: '🍄' };

// 画面、输入和计时留在此处；扣币、答案与成绩只由纯规则模块决定。
export function createParkGames({ getGame, change, refresh, notify, onOpen, onClose }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'park-game-dialog';
  dialog.setAttribute('aria-labelledby', 'parkGameTitle');
  document.body.append(dialog);
  let selectedId = null, roundId = null, pending = false, playing = false, frame = 0, lane = 1, elapsed = 0, previousTime = 0;
  let shownWave = '';
  let errorText = '', endPrompt = false;

  function stopClock() { cancelAnimationFrame(frame); frame = 0; previousTime = 0; }
  function close() {
    playing = false; stopClock();
    if (dialog.open) dialog.close();
  }
  function activeRound() { return getGame().activeParkGame; }
  function gameDefinition(id = selectedId) { return PARK_GAMES.find((game) => game.id === id); }
  function currentResult() { return (getGame().parkGameHistory || []).find((round) => round.id === roundId); }

  function render() {
    stopClock();
    const active = activeRound();
    const definition = gameDefinition(active?.gameId || selectedId);
    if (!definition) return;
    if (active) { roundId = active.id; selectedId = active.gameId; }
    const result = !active && currentResult();
    dialog.innerHTML = `<header class="park-game-heading"><div><p class="park-kicker">咕咕的森林游乐场</p><h2 id="parkGameTitle">${text(definition.emoji)} ${text(definition.name)}</h2></div><button class="icon-button" data-game-action="close" aria-label="暂停并收起小游戏">×</button></header>
      <div class="park-game-meta"><span>考拉币 <b data-game-coins>${getGame().coins}</b></span><span>${active ? `本局已付 ${active.cost} 币 · 续玩免费` : `${definition.price} 币 / 局`}</span></div>
      ${errorText ? `<p class="park-game-error" role="alert">${text(errorText)}</p>` : ''}
      <div class="park-game-content">${active ? roundMarkup(active) : result ? resultMarkup(result, definition) : introMarkup(definition)}</div>
      <footer class="park-game-footer"><span>${active ? '每步自动保存，刷新可继续' : '模拟币娱乐 · 无现金或随机币奖励'}</span>${active ? '<button class="text-button" data-game-action="end-prompt">提前结束本局</button>' : ''}</footer>
      ${endPrompt && active ? '<div class="park-end-confirm" role="alert"><p>结束后保留当前成绩，已花模拟币不退还。</p><button class="button button-quiet" data-game-action="cancel-end">继续这局</button><button class="button button-primary" data-game-action="end">确认结束</button></div>' : ''}`;
    dialog.toggleAttribute('aria-busy', pending);
    if (pending) dialog.querySelectorAll('button,input').forEach((element) => { element.disabled = true; });
    if (active?.gameId === 'leaf-catch') {
      elapsed = 0;
      const waveKey = `${active.id}:${active.progress.step}`;
      if (shownWave !== waveKey) lane = active.progress.basketLane;
      shownWave = waveKey;
      moveBasket(lane);
      if (playing && !pending && !endPrompt && !document.hidden && dialog.open) frame = requestAnimationFrame(tick);
    }
    if (dialog.open && !pending) {
      const focusTarget = endPrompt ? '[data-game-action="cancel-end"]'
        : active?.gameId === 'leaf-catch' ? playing ? '.park-leaf-field' : '[data-game-action="resume"]'
          : active?.gameId === 'word-spell' ? '#parkSpellAnswer'
            : active?.gameId === 'memory' ? '.park-memory-message [data-game-action="clear"], [data-game-action="flip"]:not(:disabled)'
              : '[data-game-action="close"]';
      dialog.querySelector(focusTarget)?.focus({ preventScroll: true });
    }
  }

  function introMarkup(game) {
    return `<div class="park-game-intro"><div class="park-game-intro-icon" aria-hidden="true">${text(game.emoji)}</div><p>${text(game.description)}</p><p class="park-game-rules">${text(Array.isArray(game.rules) ? game.rules.join(' ') : game.rules)}</p><p class="park-game-note">开始时扣 ${game.price} 枚模拟币；中途收起会暂停，可以免费继续。</p><button class="button button-primary park-start-game" data-game-action="start" ${getGame().coins < game.price ? 'disabled' : ''}>${getGame().coins < game.price ? `还差 ${game.price - getGame().coins} 币` : `花 ${game.price} 币，开始游戏`}</button></div>`;
  }

  function roundMarkup(round) {
    const progress = round.progress;
    if (round.gameId === 'leaf-catch') {
      const drop = progress.waves[progress.step];
      return `<div class="park-round-score"><span>第 ${progress.step + 1} / 20 次落物</span><strong>${progress.score} 分</strong></div>
        <div class="park-leaf-field" tabindex="0" aria-label="接桉叶，左右方向键或下方按钮移动篮子，接住叶子并避开树枝">
          <div class="park-leaf-cloud cloud-one"></div><div class="park-leaf-cloud cloud-two"></div><div class="park-leaf-trees" aria-hidden="true">♠　♠　♠</div>
          <div class="park-leaf-lanes"><i></i><i></i><i></i></div><span class="park-falling-object lane-${drop.lane}" aria-label="${drop.kind === 'leaf' ? '桉叶' : '树枝'}">${drop.kind === 'leaf' ? '🍃' : '🪵'}</span><span class="park-basket lane-${lane}" aria-label="接叶篮">🧺</span>
          ${!playing ? '<div class="park-leaf-paused"><strong>准备好接叶了吗？</strong><button class="button button-primary" data-game-action="resume">继续接叶</button></div>' : ''}
        </div><div class="park-lane-buttons" aria-label="移动篮子">${['左边', '中间', '右边'].map((name, index) => `<button data-game-action="lane" data-lane="${index}" aria-pressed="${lane === index}">${name}</button>`).join('')}</div>
        <div class="park-round-help"><span>左右键 / 1、2、3 移动 · 叶子 +1 · 树枝 −1</span><button class="text-button" data-game-action="${playing ? 'pause' : 'resume'}">${playing ? '暂停' : '继续'}</button></div>`;
    }
    if (round.gameId === 'memory') {
      const mismatch = progress.flipped.length === 2 && progress.cards[progress.flipped[0]] !== progress.cards[progress.flipped[1]];
      return `<div class="park-round-score"><span>找到 ${progress.matched.length / 2} / 6 对</span><strong>${progress.moves} 步</strong></div><div class="park-memory-grid">${progress.cards.map((symbol, index) => {
        const matched = progress.matched.includes(index), visible = matched || progress.flipped.includes(index);
        return `<button class="park-memory-card ${matched ? 'is-matched' : visible ? 'is-flipped' : ''}" data-game-action="flip" data-card="${index}" ${matched || visible || mismatch ? 'disabled' : ''} aria-label="${visible ? `${symbols[symbol]} ${matched ? '已配对' : '已翻开'}` : `翻开第 ${index + 1} 张卡片`}"><span>${visible ? symbols[symbol] : '❧'}</span><small>${visible ? matched ? '配对成功' : '记住它' : index + 1}</small></button>`;
      }).join('')}</div><div class="park-memory-message" role="status">${mismatch ? '<span>这一对不一样，记住位置再来。</span><button class="button button-primary" data-game-action="clear">收起这两张</button>' : '<span>每次翻两张相同图案，找到全部六对。</span>'}</div>`;
    }
    const question = progress.questions[progress.step];
    const last = progress.answers.at(-1), previous = progress.questions[progress.step - 1];
    return `<div class="park-round-score"><span>第 ${progress.step + 1} / 5 题</span><strong>${progress.score} 分</strong></div>${last ? `<p class="park-spell-feedback" role="status">${last.correct ? '✓ 上一题答对了' : `上一题答案：${text(previous.word)}`}</p>` : ''}<div class="park-spelling"><span class="park-game-symbol" aria-hidden="true">✎</span><h3>${text(question.meaning)}</h3><p>${text(question.hint)}</p><form id="parkSpellForm"><label for="parkSpellAnswer">输入英文单词</label><input id="parkSpellAnswer" name="answer" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="写下你的答案" required><button class="button button-primary" type="submit">提交答案</button></form><small>忽略大小写和首尾空白，其余字母须完全一致。</small></div>`;
  }

  function resultMarkup(result, definition) {
    return `<div class="park-game-result"><div class="park-game-result-icon" aria-hidden="true">${result.abandoned ? '🌿' : '🏅'}</div><p class="park-kicker">${result.abandoned ? '这局先到这里，下次再来' : '这一局完成了！'}</p><h3>${result.score}<small> / ${result.maxScore} 分</small></h3>${result.gameId === 'memory' ? `<p>本局用了 ${result.moves} 步，已找到 ${result.score} / 6 对图案。</p>` : '<p>成绩已保存在你的游玩记录里。</p>'}<p class="park-game-note">本局花费 ${result.cost} 币，结算不再扣币。</p><div class="park-result-actions"><button class="button button-quiet" data-game-action="close">回到小岛</button><button class="button button-primary" data-game-action="start" ${getGame().coins < definition.price ? 'disabled' : ''}>再玩一局 · ${definition.price} 币</button></div></div>`;
  }

  async function commit(update) {
    if (pending) return;
    pending = true; stopClock(); errorText = '';
    dialog.setAttribute('aria-busy', 'true');
    dialog.querySelectorAll('button,input').forEach((element) => { element.disabled = true; });
    try { await change(update); }
    catch (error) {
      playing = false; errorText = error.message || '保存失败，请重试。';
      try { await refresh(); } catch { /* 保留错误和原画面，不覆盖存档。 */ }
      notify(errorText);
    } finally {
      pending = false;
      if (dialog.open) render();
    }
  }

  function moveBasket(nextLane) {
    lane = Math.max(0, Math.min(2, nextLane));
    const basket = dialog.querySelector('.park-basket');
    if (basket) basket.className = `park-basket lane-${lane}`;
    dialog.querySelectorAll('[data-game-action="lane"]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.lane) === lane)));
  }

  function tick(now) {
    const round = activeRound();
    if (!dialog.open || !playing || pending || document.hidden || round?.gameId !== 'leaf-catch') return;
    if (!previousTime) previousTime = now;
    elapsed += Math.min(now - previousTime, 80); previousTime = now;
    const falling = dialog.querySelector('.park-falling-object');
    const field = dialog.querySelector('.park-leaf-field');
    if (!field || !falling) return;
    const duration = Math.max(1050, 1850 - round.progress.step * 35);
    falling.style.top = `${8 + Math.min(elapsed / duration, 1) * 70}%`;
    falling.style.rotate = `${Math.sin(elapsed / 180) * 18}deg`;
    if (elapsed >= duration) {
      void commit((game) => playParkGame(game, round.id, { type: 'catch', lane, step: round.progress.step }));
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  dialog.addEventListener('click', (event) => {
    const button = event.target.closest('[data-game-action]');
    if (!button || pending) return;
    const action = button.dataset.gameAction, round = activeRound();
    if (action === 'close') return close();
    if (action === 'start') {
      roundId = crypto.randomUUID(); playing = true; endPrompt = false;
      return void commit((game) => startParkGame(game, selectedId, roundId));
    }
    if (action === 'resume') { playing = true; render(); dialog.querySelector('.park-leaf-field')?.focus(); return; }
    if (action === 'pause') { playing = false; render(); return; }
    if (action === 'lane') return moveBasket(Number(button.dataset.lane));
    if (action === 'end-prompt') { playing = false; endPrompt = true; render(); return; }
    if (action === 'cancel-end') { endPrompt = false; render(); return; }
    if (!round) return;
    if (action === 'end') { endPrompt = false; return void commit((game) => abandonParkGame(game, round.id)); }
    if (action === 'flip') return void commit((game) => playParkGame(game, round.id, { type: 'flip', index: Number(button.dataset.card), revision: round.revision }));
    if (action === 'clear') return void commit((game) => playParkGame(game, round.id, { type: 'clear', revision: round.revision }));
  });
  dialog.addEventListener('submit', (event) => {
    if (event.target.id !== 'parkSpellForm') return;
    event.preventDefault();
    const round = activeRound(), answer = dialog.querySelector('#parkSpellAnswer')?.value;
    if (pending || round?.gameId !== 'word-spell' || !answer?.trim()) return;
    void commit((game) => playParkGame(game, round.id, { type: 'answer', answer, step: round.progress.step })).then(() => dialog.querySelector('#parkSpellAnswer')?.focus());
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); return; }
    if (activeRound()?.gameId !== 'leaf-catch' || pending) return;
    if (['ArrowLeft', 'ArrowRight', '1', '2', '3', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === ' ') { playing = !playing; render(); }
      else moveBasket(event.key === 'ArrowLeft' ? lane - 1 : event.key === 'ArrowRight' ? lane + 1 : Number(event.key) - 1);
    }
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { playing = false; stopClock(); onClose(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dialog.open) { playing = false; render(); }
  });
  return {
    get isOpen() { return dialog.open; },
    open(gameId) {
      selectedId = activeRound()?.gameId || gameId;
      if (!gameDefinition()) return;
      roundId = activeRound()?.id || null; playing = false; errorText = ''; endPrompt = false;
      render();
      if (!dialog.open) dialog.showModal();
      onOpen();
    },
    sync() { if (dialog.open && !pending) { playing = false; render(); } },
    close,
  };
}
