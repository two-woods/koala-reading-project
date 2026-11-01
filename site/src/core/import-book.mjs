import { parseEpub } from './epub.mjs';
import { parseMarkdown, parseText } from './content.mjs';

const MAX_FILE_BYTES = 150 * 1024 * 1024;

export async function importBookFile(file) {
  if (!file) throw new Error('没有选择文件。');
  if (file.size > MAX_FILE_BYTES) throw new Error('文件超过 150 MB，暂不导入。');
  const extension = file.name.split('.').pop()?.toLocaleLowerCase();
  let parsed;
  if (extension === 'epub') {
    parsed = await parseEpub(file);
  } else if (extension === 'txt') {
    parsed = parseText(await file.text(), file.name.replace(/\.txt$/i, '') || '未命名读物');
  } else if (extension === 'md' || extension === 'markdown') {
    parsed = parseMarkdown(await file.text(), file.name.replace(/\.(md|markdown)$/i, '') || '未命名读物');
  } else {
    throw new Error('仅支持 EPUB、TXT 和 Markdown 文件。');
  }
  if (!parsed.chapters.some((chapter) => chapter.paragraphs?.length)) throw new Error('文件中没有可阅读的正文。');
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const versionHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    id: crypto.randomUUID(),
    title: parsed.title || file.name,
    fileName: file.name,
    format: extension,
    importedAt: Date.now(),
    versionHash,
    chapters: parsed.chapters,
    ...(extension === 'epub' ? { cover: parsed.cover, coverCheckedAt: Date.now() } : {}),
    currentChapterId: parsed.chapters[0].id,
    scrollY: 0,
    progress: 0,
  };
}
