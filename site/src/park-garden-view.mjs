import { escapeHtml } from './core/content.mjs';
import { FLOWER_CATALOG, GARDEN_BEDS, getGarden, isGardenBedWet } from './core/park-garden-rules.mjs';

const text = (value) => escapeHtml(value ?? '');

export function gardenPanelMarkup(game, selectedBedId = 'west-1', selectedFlowerId = 'daisy', busy = false) {
  const beds = new Map(getGarden(game).beds.map((bed) => [bed.id, bed]));
  const selectedBed = GARDEN_BEDS.find((bed) => bed.id === selectedBedId) || GARDEN_BEDS[0];
  const planted = beds.get(selectedBed.id);
  const currentFlower = FLOWER_CATALOG.find((flower) => flower.id === planted?.flowerId);
  const selectedFlower = FLOWER_CATALOG.find((flower) => flower.id === selectedFlowerId) || currentFlower || FLOWER_CATALOG[0];
  const wet = Boolean(currentFlower && isGardenBedWet(planted));
  const alreadyPlanted = currentFlower?.id === selectedFlower.id;
  const plantedCount = GARDEN_BEDS.filter((bed) => FLOWER_CATALOG.some((flower) => flower.id === beds.get(bed.id)?.flowerId)).length;
  const mapBeds = [...GARDEN_BEDS].sort((a, b) => a.position.z - b.position.z || a.position.x - b.position.x);
  return `<section class="park-panel-content garden-panel" aria-labelledby="parkPanelTitle" aria-busy="${Boolean(busy)}">
    <div class="park-panel-heading"><div><p class="park-kicker">把喜欢的颜色，种在微风里</p><h2 id="parkPanelTitle" tabindex="-1">大王的小花园</h2></div><button class="icon-button" data-action="park-close" aria-label="收起花园面板">×</button></div>
    <div class="garden-intro"><span aria-hidden="true">✿</span><div><strong>让喜欢的花，自在长进草地里</strong><p>沿着弯弯的小径，挑一处喜欢的位置。大王会走到花丛旁，陪花儿晒太阳、喝点水。</p></div><span class="garden-free">花种与照料免费</span></div>
    <div class="garden-layout">
      <section class="garden-map-section" aria-labelledby="gardenMapTitle"><div class="garden-section-heading"><h3 id="gardenMapTitle">在草地里选一处</h3><span>${plantedCount} / ${GARDEN_BEDS.length} 已种植</span></div>
        <div class="garden-bed-map"><svg class="garden-map-path" viewBox="0 0 360 430" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="garden-map-trail" d="M 196 435 C 232 378 177 348 180 294 S 235 240 207 195 S 145 150 172 109 S 210 47 195 -5"/><path class="garden-map-stones" d="M 196 435 C 232 378 177 348 180 294 S 235 240 207 195 S 145 150 172 109 S 210 47 195 -5"/></svg>${mapBeds.map((bed) => {
          const record = beds.get(bed.id), flower = FLOWER_CATALOG.find((item) => item.id === record?.flowerId);
          const isWet = Boolean(flower && isGardenBedWet(record));
          return `<button class="garden-bed ${flower ? 'is-planted' : 'is-empty'} ${bed.id === selectedBed.id ? 'is-selected' : ''} ${isWet ? 'is-wet' : ''}" data-action="garden-bed-select" data-bed-id="${text(bed.id)}" aria-pressed="${bed.id === selectedBed.id}" aria-label="${text(bed.name)}，${flower ? text(flower.name) : '未种植'}${isWet ? '，土壤湿润' : ''}" ${busy ? 'disabled' : ''}><span class="garden-bed-check" aria-hidden="true">✓</span><strong>${text(bed.name)}</strong><span class="garden-bed-blooms" aria-hidden="true">${flower ? Array.from({ length: 5 }, () => `<span>${text(flower.emoji)}</span>`).join('') : '<span>❧</span><span>＋</span>'}</span><small>${flower ? text(flower.name) : '这里可以种花'}${isWet ? '<span class="garden-wet-dot" aria-hidden="true"> · 湿润</span>' : ''}</small></button>`;
        }).join('')}</div><p class="garden-map-entry"><span aria-hidden="true">↑</span> 踏上石径，走进花丛间</p>
      </section>
      <section class="garden-care" aria-labelledby="gardenCareTitle"><div class="garden-care-heading"><div><p class="garden-eyebrow">选中的种植位置</p><h3 id="gardenCareTitle">${text(selectedBed.name)}</h3></div><button class="text-button" data-action="garden-visit" data-bed-id="${text(selectedBed.id)}" ${busy ? 'disabled' : ''}>带大王走过去 ↗</button></div>
        <div class="garden-bed-status ${wet ? 'is-wet' : ''}" role="status"><span aria-hidden="true">${currentFlower ? text(currentFlower.emoji) : '❧'}</span><div><strong>${currentFlower ? `这里种着${text(currentFlower.name)}` : '这片草地正等着花开'}</strong><small>${currentFlower ? wet ? '土壤湿润，花儿刚喝过水' : '花儿自在地开着，随时可以浇点水' : '挑一种喜欢的花，种下就能看到它开放'}</small></div></div>
        <div class="garden-section-heading"><h4>今天想种什么？</h4><span>四种花 · 全部免费</span></div><div class="garden-flower-choices" aria-label="选择花种">${FLOWER_CATALOG.map((flower) => `<button class="garden-flower-choice ${flower.id === selectedFlower.id ? 'is-selected' : ''}" data-action="garden-flower-select" data-flower-id="${text(flower.id)}" aria-pressed="${flower.id === selectedFlower.id}" aria-label="选择${text(flower.name)}" ${busy ? 'disabled' : ''}><span class="garden-flower-symbol" aria-hidden="true">${text(flower.emoji)}</span><span><strong>${text(flower.name)}</strong><small lang="en">${text(flower.english)}</small></span><span class="garden-choice-check" aria-hidden="true">${flower.id === selectedFlower.id ? '✓' : ''}</span></button>`).join('')}</div>
        <p class="garden-flower-description">${text(selectedFlower.description)}</p>
        <div class="garden-care-actions"><button class="button ${alreadyPlanted || busy ? 'button-quiet' : 'button-primary'}" data-action="garden-plant" data-bed-id="${text(selectedBed.id)}" data-flower-id="${text(selectedFlower.id)}" ${alreadyPlanted || busy ? 'disabled' : ''}>${busy ? '正在照料…' : alreadyPlanted ? `已种植${text(selectedFlower.name)}` : currentFlower ? `换种${text(selectedFlower.name)}` : `种下${text(selectedFlower.name)}`}</button><button class="button button-quiet garden-water-button" data-action="garden-water" data-bed-id="${text(selectedBed.id)}" ${!currentFlower || busy ? 'disabled' : ''}><span aria-hidden="true">💧</span> ${wet ? '再浇一点水' : '给花浇水'}</button></div>
        <p class="garden-action-hint">${currentFlower && !alreadyPlanted ? `换种后，这里的${text(currentFlower.name)}会变成${text(selectedFlower.name)}。` : '大王走到花丛旁，才会开始种植或浇水。'}</p>
      </section>
    </div>
    <p class="park-note garden-note">种下即开花，浇水后土壤会湿润约 30 分钟。过一阵再来，花儿也会好好开放。种植与照料自动保存。</p>
  </section>`;
}
