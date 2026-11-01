import { escapeHtml } from './core/content.mjs';
import { DAILY_CHECKIN_COINS, localDayKey, PARK_SLOTS, TOY_CATALOG, unlockedStickers } from './core/playground.mjs';
import { PARK_NPCS } from './core/park-catalog.mjs';
import { PARK_GAMES } from './core/park-games.mjs';
import { wardrobeMarkup } from './wardrobe-view.mjs';
import { adventurePanelMarkup } from './park-adventure-view.mjs';
import { getAdventure } from './core/park-adventure-rules.mjs';
import { gardenPanelMarkup } from './park-garden-view.mjs';

const text = (value) => escapeHtml(value ?? '');
const originalToys = ['eucalyptus-swing', 'story-tent', 'forest-tea-set', 'little-train'];
const art = (toy) => originalToys.includes(toy.id)
  ? `<span class="park-prop prop-${toy.id}" aria-hidden="true"></span>`
  : `<span class="park-toy-icon" aria-hidden="true">${text(toy.emoji)}</span>`;

export function parkMarkup(game, panel = null, selectedToyId = null, npcId = null, secretId = null, gardenOptions = {}) {
  const checkedIn = game.checkInDates.includes(localDayKey());
  const owned = TOY_CATALOG.filter((toy) => game.ownedToyIds.includes(toy.id));
  const placements = game.toyPlacements || [];
  const selected = owned.find((toy) => toy.id === selectedToyId);
  const arranging = panel === 'arrange';
  return `
    <section class="park-world" aria-label="考拉大王的森林小岛">
      <header class="park-header">
        <div><p class="park-kicker">把世界读懂，把山野跑遍</p><h1>考拉大王的乐园<span class="park-leaf" aria-hidden="true">♛</span></h1><p class="adventure-role"><span aria-hidden="true">✦</span>森林翻译官 · 越野跑爱好者</p></div>
        <div class="park-wallet"><span class="park-coin" aria-hidden="true">❧</span><div><span>考拉币 <strong>${game.coins}</strong></span><small>本机模拟币</small></div></div>
      </header>
      <div class="park-scene-status"><span><i class="status-dot"></i>${arranging ? selected ? `正在布置：${text(selected.name)} · 点击草地落点` : '选择背包里的摆设，再点击草地落点' : `小岛藏着 8 个秘密 · 已发现 ${getAdventure(game).foundIds.length} / 8`}</span><button class="park-checkin" data-action="check-in" ${checkedIn ? 'disabled' : ''}>${checkedIn ? '✓ 今日已签到' : `☀ 签到 +${DAILY_CHECKIN_COINS}`}</button></div>
      <div class="park-stage park-stage-live">
        <canvas class="park-canvas" tabindex="0" aria-label="实时三维考拉乐园。点击草地行走，拖动旋转，滚轮或双指缩放。聚焦后用方向键或 WASD 移动，空格暂停散步。"></canvas>
        <div class="park-3d-loading" role="status">正在打开三维乐园…</div>
        <button class="button button-quiet park-3d-retry" data-action="park-retry">重新加载场景</button>
        <div class="park-camera-tools" aria-label="场景控制">
          <button data-scene-control="home">全景</button><button data-scene-control="follow">跟随考拉</button><button class="park-trail-run" data-action="park-trail-run">⚑ 林间开跑</button><button class="park-trail-stop" data-scene-control="stop-trail" hidden>结束跑步</button><button data-scene-control="near" aria-label="拉近视角">＋</button><button data-scene-control="far" aria-label="拉远视角">−</button><button data-scene-control="expand">展开场景</button>
        </div>
        <div class="park-scene-bottom"><span class="park-live-status" role="status">点击草地走动 · 拖动转视角 · 滚轮缩放</span><button data-scene-control="roam" aria-pressed="true">暂停散步</button></div>
      </div>
      <nav class="park-dock" aria-label="乐园工具">
        ${[['adventure', '✧', '探索'], ['garden', '✿', '花园'], ['shop', '▥', '商店'], ['bag', '▢', '背包'], ['wardrobe', '♧', '衣橱'], ['arrange', '✥', '布置'], ['games', '⚑', '游乐场'], ['npc', '☻', '居民']].map(([id, icon, name]) => `<button class="park-dock-button ${panel === id ? 'is-active' : ''}" data-action="park-panel" data-panel="${id}" aria-expanded="${panel === id}" aria-controls="parkPanel"><span aria-hidden="true">${icon}</span>${name}${id === 'bag' && owned.length ? `<small>${owned.length}</small>` : ''}</button>`).join('')}
      </nav>
      <p class="park-caption">${arranging ? '布置自动保存 · 点击已摆放物品可移动' : '点击草地行走 · 拖动旋转 · 滚轮或双指缩放 · 方向键 / WASD 移动'}</p>
      <div id="parkPanel" ${panel ? '' : 'hidden'}>${panel === 'garden' ? gardenPanelMarkup(game, gardenOptions.bedId, gardenOptions.flowerId, gardenOptions.busy) : panel === 'adventure' ? adventurePanelMarkup(game, secretId) : panel === 'wardrobe' ? wardrobeMarkup(game) : panel === 'games' ? gamesPanel(game) : panel === 'npc' ? residentsPanel(npcId) : panel ? panelMarkup(game, panel, selectedToyId) : ''}</div>
    </section>
    <details class="park-journal"><summary><span>成长手记</span><span>累计签到 ${game.checkInDates.length} 天 · ${owned.length} 件摆设 <span aria-hidden="true">⌄</span></span></summary><div class="park-journal-content">
      <p class="park-note">每天签到获得 ${DAILY_CHECKIN_COINS} 枚模拟币，按累计天数收集贴纸；漏签不会扣币。</p>
      <div class="sticker-grid">${unlockedStickers(game).map((sticker) => `<article class="sticker-card ${sticker.unlocked ? 'sticker-unlocked' : 'sticker-locked'}"><span class="sticker-emoji" aria-hidden="true">${sticker.unlocked ? sticker.emoji : '🔒'}</span><strong>${text(sticker.name)}</strong><small>${sticker.unlocked ? '已收集' : `累计签到 ${sticker.days} 天解锁`}</small></article>`).join('')}</div>
      <h2>考拉币记录</h2><div class="transaction-list">${[...game.transactions].reverse().slice(0, 8).map((item) => `<div class="transaction-row"><div><strong>${text(item.title)}</strong><span>${text(item.day)}</span></div><b class="${item.amount >= 0 ? 'coin-earned' : 'coin-spent'}">${item.amount >= 0 ? '+' : ''}${item.amount} 币</b></div>`).join('')}</div>
    </div></details><p class="park-footnote">实时 3D 乐园 · 基础景观固定，购买的摆设可布置 · 仅为本机模拟奖励</p>`;
}

function panelMarkup(game, panel, selectedToyId) {
  const isShop = panel === 'shop';
  const toys = isShop ? TOY_CATALOG : TOY_CATALOG.filter((toy) => game.ownedToyIds.includes(toy.id));
  const placements = game.toyPlacements || [];
  return `<section class="park-panel-content" aria-labelledby="parkPanelTitle"><div class="park-panel-heading"><div><p class="park-kicker">${isShop ? '小小家具，大大的幸福' : panel === 'arrange' ? '选一件喜欢的，给它安个家' : '收藏在这里，也可以摆进乐园'}</p><h2 id="parkPanelTitle" tabindex="-1">${isShop ? '森林家具商店' : panel === 'arrange' ? '布置乐园' : '我的背包'}</h2></div><button class="icon-button" data-action="park-close" aria-label="收起乐园面板">×</button></div>
    ${toys.length ? `<div class="park-item-grid">${toys.map((toy) => {
      const owned = game.ownedToyIds.includes(toy.id);
      const slot = PARK_SLOTS.find((item) => item.id === placements.find((item) => item.toyId === toy.id)?.slotId);
      const shortfall = Math.max(0, toy.price - game.coins);
      return `<article class="park-item ${selectedToyId === toy.id ? 'is-selected' : ''}"><div class="park-item-art">${art(toy)}${slot ? '<span class="park-item-badge">已布置</span>' : owned ? '<span class="park-item-badge">已拥有</span>' : ''}</div><h3>${text(toy.name)}</h3><p>${isShop ? text(toy.description) : slot ? `已放在${slot.name}` : '在背包里等你布置'}</p><div class="park-item-actions">${isShop ? `<span class="park-price">❧ ${toy.price}</span><button class="button ${owned || shortfall ? 'button-quiet' : 'button-primary'}" data-action="purchase-toy" data-toy-id="${toy.id}" ${owned || shortfall ? 'disabled' : ''}>${owned ? '已拥有' : shortfall ? `还差 ${shortfall} 币` : '兑换'}</button>` : `<button class="button ${selectedToyId === toy.id ? 'button-quiet' : 'button-primary'}" data-action="park-select" data-toy-id="${toy.id}">${selectedToyId === toy.id ? '已选中 · 选落点' : slot ? '移动位置' : '放进乐园'}</button>${slot ? `<button class="text-button" data-action="park-remove" data-toy-id="${toy.id}">收回背包</button>` : ''}`}</div></article>`;
    }).join('')}</div>` : '<div class="park-empty-bag"><span aria-hidden="true">▢</span><h3>给乐园挑一份小礼物吧</h3><p>在商店兑换摆设后，就能在这里选择并布置。</p><button class="button button-primary" data-action="park-panel" data-panel="shop">逛逛商店</button></div>'}
    ${panel === 'arrange' && selectedToyId ? `<div class="park-slot-choices" aria-label="选择摆放位置">${PARK_SLOTS.map((slot) => {
      const occupied=placements.some((item)=>item.slotId===slot.id && item.toyId!==selectedToyId);
      return `<button class="button button-quiet" data-action="park-place" data-slot-id="${slot.id}" ${occupied ? 'disabled' : ''}>${slot.name}${occupied ? ' · 已占用' : ''}</button>`;
    }).join('')}</div>` : ''}
    <p class="park-note">${isShop ? `共有 ${TOY_CATALOG.length} 件摆设，每件可兑换一次，购买后放入背包。使用模拟币，无真实订单或配送。` : `摆放、移动和收回都不扣币。${PARK_SLOTS.length} 处草地可供布置，每处放一件；数据随书房备份一起保存。`}</p></section>`;
}

function panelHeading(kicker, title) {
  return `<div class="park-panel-heading"><div><p class="park-kicker">${kicker}</p><h2 id="parkPanelTitle" tabindex="-1">${title}</h2></div><button class="icon-button" data-action="park-close" aria-label="收起乐园面板">×</button></div>`;
}

function gamesPanel(game) {
  const active = game.activeParkGame;
  return `<section class="park-panel-content">${panelHeading('咕咕的游乐场 · 休息一小会儿', '今天想玩什么？')}
    ${active ? `<div class="park-resume"><span>有一局${text(PARK_GAMES.find((item) => item.id === active.gameId)?.name)}等你回来，继续不扣币。</span><button class="button button-primary" data-action="park-game-open" data-game-id="${text(active.gameId)}">继续上局</button></div>` : ''}
    <div class="park-game-cards">${PARK_GAMES.map((item) => {
      const history = (game.parkGameHistory || []).filter((round) => round.gameId === item.id && !round.abandoned);
      const best = history.length ? (item.id === 'memory' ? Math.min(...history.map((round) => round.moves)) : Math.max(...history.map((round) => round.score))) : null;
      return `<article class="park-game-card game-card-${item.id}"><span class="park-game-symbol" aria-hidden="true">${text(item.emoji)}</span><small>${item.id === 'word-spell' ? '单词挑战' : '轻松休闲'}</small><h3>${text(item.name)}</h3><p>${text(item.description)}</p><div class="park-game-card-bottom"><span>${item.price} 币 / 局</span><button class="button button-primary" data-action="park-game-open" data-game-id="${item.id}">查看玩法</button></div><small>${best === null ? '还没有成绩，来试试吧' : `最佳 ${best} ${item.id === 'memory' ? '步' : '分'} · 已完成 ${history.length} 局`}</small></article>`;
    }).join('')}</div>
    <p class="park-note">查看玩法免费，点击“开始”才扣模拟币。暂停或刷新后可继续；成绩不兑换考拉币。每日签到可得 ${DAILY_CHECKIN_COINS} 币。</p>
    ${(game.parkGameHistory || []).length ? `<h3 class="park-history-title">最近游玩</h3><div class="park-score-list">${[...game.parkGameHistory].reverse().slice(0, 6).map((round) => `<div><strong>${text(PARK_GAMES.find((item) => item.id === round.gameId)?.name)}</strong><span>${round.abandoned ? '提前结束' : `${round.score} 分`} · 已花 ${round.cost} 币</span></div>`).join('')}</div>` : ''}</section>`;
}

function residentsPanel(npcId) {
  const talks = {
    'rabbit-guide': { speech: '大王回来啦！今天有新的翻译委托吗？你工作桌边那盏小灯还亮着呢。上次越野跑留下的泥脚印，我也替你保留好了。打开探索手账，森林里还有 8 个属于你的小故事。', action: 'park-panel', panel: 'adventure', label: '看看森林里的线索' },
    'fox-shopkeeper': { speech: '考拉大王，东边补给站的香蕉和水都备好了！你帮我翻译进口茶叶的说明书，我就帮你照看跑步补给。今天也带了好多新家具，跑完一圈再来逛逛？', action: 'park-panel', panel: 'shop', label: '逛逛家具市集' },
    'owl-host': { speech: '大王，我终于明白电台里那句 Break a leg 了！翻译得先听语境，不能逐字猜。等你跑完山野环线，我们再玩接桉叶、翻牌和单词挑战吧。', action: 'park-panel', panel: 'games', label: '打开游乐场' },
  };
  const chosen = PARK_NPCS.find((npc) => npc.id === npcId);
  return `<section class="park-panel-content">${panelHeading('森林里多了几个新朋友', '小岛居民')}<div class="park-residents">${PARK_NPCS.map((npc) => `<button class="park-resident ${npc.id === npcId ? 'is-selected' : ''}" data-action="park-npc" data-npc-id="${npc.id}"><span aria-hidden="true">${text(npc.emoji)}</span><strong>${text(npc.name)}</strong><small>${text(npc.role)}</small></button>`).join('')}</div>${chosen ? `<div class="park-npc-dialog"><span class="park-npc-avatar" aria-hidden="true">${text(chosen.emoji)}</span><div><h3>${text(chosen.name)}</h3><p>${text(talks[chosen.id].speech)}</p><button class="button button-primary" data-action="${talks[chosen.id].action}" data-panel="${talks[chosen.id].panel}">${talks[chosen.id].label}</button></div></div>` : '<p class="park-note">点击居民聊一聊，也可以直接点击场景里的角色或名字。</p>'}</section>`;
}
