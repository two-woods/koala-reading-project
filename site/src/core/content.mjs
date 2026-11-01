export function normalizeParagraphs(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({ kind: 'paragraph', text }));
}

function stripMarkdownInline(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|[^*])\*\*?([^*]+)\*\*?(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_{1,2}([^_]+)_{1,2}(?!_)/g, '$1$2')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function parseMarkdown(text, fallbackTitle = '未命名读物') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const chapters = [];
  let title = '';
  let current = { title: '正文', paragraphs: [] };
  let pending = [];
  const flush = () => {
    const cleaned = stripMarkdownInline(pending.join(' ').replace(/\s+/g, ' '));
    if (cleaned) current.paragraphs.push({ kind: 'paragraph', text: cleaned });
    pending = [];
  };
  for (const line of lines) {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flush();
      const headingText = stripMarkdownInline(heading[2]);
      if (!title && heading[1].length === 1) title = headingText;
      if (current.paragraphs.length || (current.title !== '正文' && chapters.length)) chapters.push(current);
      current = { title: headingText || `第 ${chapters.length + 1} 章`, paragraphs: [] };
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) continue;
    pending.push(line.replace(/^\s*[-*+]\s+/, '').replace(/^\s*>\s?/, ''));
  }
  flush();
  if (current.paragraphs.length || !chapters.length) chapters.push(current);
  return {
    title: title || fallbackTitle,
    chapters: chapters.map((chapter, index) => ({
      id: `chapter-${index + 1}`,
      title: chapter.title === '正文' && chapters.length === 1 ? (title || '正文') : chapter.title,
      paragraphs: chapter.paragraphs,
    })),
  };
}

export function parseText(text, fallbackTitle = '未命名读物') {
  const paragraphs = normalizeParagraphs(text);
  return {
    title: fallbackTitle,
    chapters: [{ id: 'chapter-1', title: '正文', paragraphs }],
  };
}

export function findCloze(sentence, answer) {
  const source = String(sentence || '').trim();
  const target = String(answer || '').trim();
  if (!source || !target) return null;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`, 'iu');
  const match = expression.exec(source);
  if (!match) return null;
  const start = match.index + match[1].length;
  return {
    prompt: `${source.slice(0, start)}_______${source.slice(start + match[2].length)}`,
    expected: match[2],
  };
}

export function gradeAnswer(userAnswer, expectedAnswer) {
  return String(userAnswer || '').trim().toLocaleLowerCase() === String(expectedAnswer || '').trim().toLocaleLowerCase();
}

export function reviewSchedule(correct, now = Date.now()) {
  const intervalDays = correct ? 3 : 1;
  return { intervalDays, dueAt: now + intervalDays * 24 * 60 * 60 * 1000 };
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
