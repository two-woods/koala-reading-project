import { escapeHtml } from './core/content.mjs';
import { getWardrobe, WARDROBE_CATALOG, WARDROBE_SLOTS } from './core/wardrobe-rules.mjs';

export function wardrobeMarkup(game) {
  const wardrobe = getWardrobe(game);
  const names = WARDROBE_SLOTS.map((slot) => WARDROBE_CATALOG.find((item) => item.id === wardrobe.equipped[slot.id]).name);
  return `<section class="park-panel-content wardrobe-panel" aria-labelledby="parkPanelTitle">
    <div class="park-panel-heading"><div><p class="park-kicker">考拉大王 · 爱越野跑的翻译官</p><h2 id="parkPanelTitle" tabindex="-1">我的衣橱</h2></div><button class="icon-button" data-action="park-close" aria-label="收起乐园面板">×</button></div>
    <div class="wardrobe-layout"><div class="wardrobe-mirror">
      <div class="wardrobe-preview"><canvas tabindex="0" aria-label="考拉试衣镜。拖动旋转，滚轮缩放，也可用下方按钮转身或查看妆容。"></canvas><p class="wardrobe-preview-status" role="status">正在打开试衣镜…</p><button class="button button-quiet wardrobe-preview-retry" data-preview-control="retry" hidden>重试试衣镜</button><div class="wardrobe-preview-tools" aria-label="试衣镜控制"><button data-preview-control="left" aria-label="向左转身">↶</button><button data-preview-control="full">全身</button><button data-preview-control="face">看妆容</button><button data-preview-control="right" aria-label="向右转身">↷</button></div></div>
      <p class="wardrobe-look-label">今天的穿搭</p><p class="wardrobe-look" role="status">${names.map(escapeHtml).join(' · ')}</p><small>拖动转身 · 滚轮缩放<br>穿戴自动保存，也会同步到乐园</small>
    </div><div class="wardrobe-collection">${WARDROBE_SLOTS.map((slot) => `<section class="wardrobe-category" aria-labelledby="wardrobe-${slot.id}"><div class="wardrobe-category-heading"><h3 id="wardrobe-${slot.id}">${slot.name}</h3><span>${slot.id === 'outfit' ? '保留你的小围巾' : slot.id === 'headwear' ? '耳边的小心思' : '给脸颊添一点颜色'}</span></div><div class="wardrobe-items">${WARDROBE_CATALOG.filter((item) => item.slot === slot.id).map((item) => {
      const owned = wardrobe.ownedIds.includes(item.id), equipped = wardrobe.equipped[slot.id] === item.id;
      const shortfall = Math.max(0, item.price - game.coins);
      return `<article class="wardrobe-item ${equipped ? 'is-equipped' : ''}" data-wardrobe-item="${item.id}" tabindex="-1"><div class="wardrobe-swatch swatch-${item.slot} ${item.id === 'forest-original' || item.id === 'no-headwear' || item.id === 'natural' ? 'swatch-original' : ''}" aria-hidden="true"><span>${item.slot === 'outfit' ? item.id === 'trail-runner' ? '01' : '♧' : item.slot === 'headwear' ? item.id === 'flower-clip' ? '✿' : '⌒' : item.id === 'star-freckles' ? '✦' : '• •'}</span></div><div class="wardrobe-item-copy"><h4>${item.name}</h4><p>${item.description}</p><small>${item.price === 0 ? '基础赠送' : owned ? '已拥有 · 随时换上' : `❧ ${item.price} 考拉币`}</small></div><button class="button ${equipped || !owned && shortfall ? 'button-quiet' : 'button-primary'}" data-action="${owned ? 'wardrobe-equip' : 'wardrobe-buy'}" data-item-id="${item.id}" ${equipped || !owned && shortfall ? 'disabled' : ''}>${equipped ? item.slot === 'makeup' ? '当前妆容' : '正在穿' : owned ? item.slot === 'makeup' ? '使用' : '换上' : shortfall ? `还差 ${shortfall} 币` : '购买并穿戴'}</button></article>`;
    }).join('')}</div></section>`).join('')}<p class="park-note">基础装扮免费赠送，更多款式用考拉币购买。每款只需购买一次，之后换装、卸妆都免费；已购装扮和搭配随书房备份保存。</p></div></div></section>`;
}
