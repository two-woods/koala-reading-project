import { escapeHtml } from './core/content.mjs';
import { PARK_SECRETS, getAdventure, adventureTitles } from './core/park-adventure-rules.mjs';

const text = (value) => escapeHtml(value ?? '');

export function adventurePanelMarkup(game, selectedId = null) {
  const found = new Set(getAdventure(game).foundIds);
  const selected = PARK_SECRETS.find((item) => item.id === selectedId);
  const titles = adventureTitles(game);
  return `<section class="park-panel-content adventure-panel" aria-labelledby="parkPanelTitle">
    <div class="park-panel-heading"><div><p class="park-kicker">把世界读懂，把山野跑遍</p><h2 id="parkPanelTitle" tabindex="-1">考拉大王的探索手账</h2></div><button class="icon-button" data-action="park-close" aria-label="收起探索手账">×</button></div>
    <div class="adventure-intro"><div class="adventure-seal" aria-hidden="true">♛</div><div><strong>考拉大王</strong><p>森林翻译官 · 越野跑爱好者</p><small>白天替朋友们翻译来信，收工后沿着林间小路跑一圈。小岛里，藏着它的 8 个小秘密。</small></div><div class="adventure-intro-actions"><button class="button button-primary" data-action="park-trail-run">⚑ 林间开跑</button><button class="button button-quiet" data-action="park-runner-equip">换上越野装</button></div></div>
    <div class="adventure-layout"><div class="adventure-pages">${[['translation', '翻译官的秘密', '从字句里，听见森林'], ['trail', '山野里的足迹', '从起跑线，到有风的地方']].map(([theme, title, caption]) => {
      const items = PARK_SECRETS.filter((item) => item.theme === theme);
      const count = items.filter((item) => found.has(item.id)).length;
      return `<section class="adventure-chapter"><div class="adventure-chapter-heading"><div><h3>${title}</h3><p>${caption}</p></div><span>${count} / ${items.length}</span></div><progress value="${count}" max="${items.length}" aria-label="${title}已发现 ${count} 个"></progress><div class="adventure-clues">${items.map((item) => `<button class="adventure-clue ${found.has(item.id) ? 'is-found' : ''} ${selected?.id === item.id ? 'is-selected' : ''}" data-action="park-adventure-select" data-secret-id="${item.id}" aria-pressed="${selected?.id === item.id}"><span aria-hidden="true">${found.has(item.id) ? item.emoji : '✧'}</span><span><strong>${found.has(item.id) ? text(item.name) : '尚未发现的小秘密'}</strong><small>${text(item.hint)}</small></span><b aria-hidden="true">${found.has(item.id) ? '✓' : '›'}</b></button>`).join('')}</div></section>`;
    }).join('')}</div><aside class="adventure-story" aria-live="polite">${selected ? `<p class="adventure-story-number">森林便笺 · ${PARK_SECRETS.indexOf(selected) + 1} / 8</p><span class="adventure-story-symbol" aria-hidden="true">${found.has(selected.id) ? selected.emoji : '✧'}</span><h3>${found.has(selected.id) ? text(selected.name) : '跟着线索去找找'}</h3>${found.has(selected.id) ? `<p class="adventure-story-copy">${text(selected.story)}</p><blockquote><p lang="en">${text(selected.quote)}</p><span>${text(selected.translation)}</span></blockquote>` : `<p class="adventure-story-copy">${text(selected.hint)}<br>走到那里，才会知道它藏着什么故事。</p>`}<button class="button button-primary" data-action="park-secret-visit" data-secret-id="${selected.id}">${found.has(selected.id) ? '再去看看' : '带大王去找找'} <span aria-hidden="true">↗</span></button>` : `<p class="adventure-story-number">已经发现 ${found.size} / 8</p><span class="adventure-story-symbol" aria-hidden="true">📔</span><h3>把好奇装进口袋</h3><p class="adventure-story-copy">选择左边的一条线索，和考拉大王一起去找找。也可以直接点击场景里的特别物件。</p><p class="adventure-story-copy">越野环线会带你经过 4 个跑山彩蛋，点击草地或按方向键就能随时停下。</p>`}</aside></div>
    <div class="adventure-titles" aria-label="探索称号">${titles.map((title) => `<article class="adventure-title ${title.unlocked ? 'is-unlocked' : ''}"><span aria-hidden="true">${title.unlocked ? '✦' : '◇'}</span><div><strong>${text(title.name)}</strong><small>${title.unlocked ? '称号已收集' : text(title.requirement)}</small></div></article>`).join('')}</div><p class="park-note">发现的故事自动记入手账，刷新后可继续探索。林间跑步和越野装扮免费；故事便笺为本乐园原创。</p>
  </section>`;
}
