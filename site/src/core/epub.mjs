import { coverArchivePath, coverCandidates, makeBookCover, MAX_COVER_SOURCE_BYTES } from './book-cover.mjs';

const MAX_FILE_BYTES = 150 * 1024 * 1024;
const MAX_ENTRY_BYTES = 80 * 1024 * 1024;
const decoder = new TextDecoder('utf-8');

function assertXml(document, label) {
  if (!document?.documentElement || document.querySelector('parsererror')) {
    throw new Error(`${label} 无法解析，文件可能损坏。`);
  }
}

function elementsByName(root, localName) {
  return [...root.getElementsByTagName('*')].filter((element) => element.localName?.toLowerCase() === localName.toLowerCase());
}

function attribute(element, name) {
  const attr = [...(element?.attributes || [])].find((item) => item.localName === name || item.name === name);
  return attr?.value || '';
}

function normalizeArchivePath(baseFile, href) {
  let value = String(href || '').split('#')[0].split('?')[0];
  try { value = decodeURIComponent(value); } catch { throw new Error('EPUB 目录包含无效的路径编码。'); }
  const pieces = value.startsWith('/') ? [] : String(baseFile || '').split('/').slice(0, -1);
  for (const part of value.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!pieces.length) throw new Error('EPUB 中存在越出压缩包目录的路径。');
      pieces.pop();
    } else {
      pieces.push(part);
    }
  }
  return pieces.join('/');
}

class ZipArchive {
  constructor(bytes, entries) {
    this.bytes = bytes;
    this.entries = entries;
  }

  static from(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const lowerBound = Math.max(0, bytes.byteLength - 65_557);
    let endRecord = -1;
    for (let offset = bytes.byteLength - 22; offset >= lowerBound; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) { endRecord = offset; break; }
    }
    if (endRecord < 0) throw new Error('未找到 EPUB 压缩包目录，文件可能不是有效 EPUB。');
    const entryCount = view.getUint16(endRecord + 10, true);
    const directoryOffset = view.getUint32(endRecord + 16, true);
    if (entryCount === 0xffff || directoryOffset === 0xffffffff) throw new Error('暂不支持 ZIP64 EPUB。');
    const entries = new Map();
    let offset = directoryOffset;
    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error('EPUB 目录结构不完整。');
      }
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff) throw new Error('暂不支持 ZIP64 EPUB。');
      if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error('EPUB 单个文件超过 80 MB，暂不导入。');
      const nameStart = offset + 46;
      const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength)).replace(/^\/+/, '');
      if (name && !name.endsWith('/')) entries.set(name, { flags, method, compressedSize, uncompressedSize, localOffset });
      offset = nameStart + nameLength + extraLength + commentLength;
    }
    return new ZipArchive(bytes, entries);
  }

  async read(path, maximumBytes = MAX_ENTRY_BYTES) {
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`EPUB 缺少必要文件：${path}`);
    if (entry.flags & 1) throw new Error('暂不支持带密码的 EPUB。');
    if (entry.uncompressedSize > maximumBytes) throw new Error('EPUB 文件条目超过读取上限。');
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const offset = entry.localOffset;
    if (offset + 30 > this.bytes.length || view.getUint32(offset, true) !== 0x04034b50) throw new Error('EPUB 文件条目损坏。');
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extraLength;
    if (start + entry.compressedSize > this.bytes.length) throw new Error('EPUB 文件条目不完整。');
    const compressed = this.bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) {
      if (compressed.length !== entry.uncompressedSize) throw new Error('EPUB 文件条目长度不符。');
      return compressed.slice();
    }
    if (entry.method !== 8) throw new Error(`暂不支持 EPUB 压缩方式 ${entry.method}。`);
    if (typeof DecompressionStream === 'undefined') throw new Error('当前浏览器不支持 EPUB 解压，请使用新版 Chrome、Edge 或 Firefox。');
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const reader = stream.getReader();
      const chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maximumBytes || length > entry.uncompressedSize) {
          await reader.cancel();
          throw new Error('EPUB 解压后的文件超过读取上限。');
        }
        chunks.push(value);
      }
      if (length !== entry.uncompressedSize) throw new Error('解压后的文件长度不符。');
      const result = new Uint8Array(length);
      let position = 0;
      for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
      return result;
    } catch (error) {
      if (error instanceof TypeError) throw new Error('当前浏览器不支持 EPUB 的 deflate-raw 解压，请升级浏览器。');
      throw error;
    }
  }

  async readText(path, maximumBytes) {
    return decoder.decode(await this.read(path, maximumBytes));
  }
}

function textBlocks(document) {
  const body = document.body || document.documentElement;
  body.querySelectorAll('script,style,noscript,svg,iframe,object,template,nav').forEach((element) => element.remove());
  const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'td', 'th', 'dt', 'dd', 'figcaption']);
  const blocks = [];
  const collectText = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    return [...node.childNodes].map(collectText).join(' ');
  };
  const visit = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE && blockTags.has(node.localName.toLowerCase())) {
      const text = collectText(node).replace(/\s+/g, ' ').trim();
      if (text) blocks.push({ kind: /^h[1-6]$/.test(node.localName.toLowerCase()) ? 'heading' : 'paragraph', text });
      return;
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(body);
  if (!blocks.length) {
    const fallback = body.textContent.replace(/\s+/g, ' ').trim();
    if (fallback) blocks.push({ kind: 'paragraph', text: fallback });
  }
  return blocks;
}

function parseHtml(text, label) {
  const document = new DOMParser().parseFromString(text, 'text/html');
  if (!document.body) throw new Error(`${label} 无法解析。`);
  const title = document.querySelector('title')?.textContent?.trim() || '';
  return { title, paragraphs: textBlocks(document) };
}

async function tableOfContents(zip, manifest, packagePath, parser) {
  const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'));
  if (navItem) {
    try {
      const navPath = normalizeArchivePath(packagePath, navItem.href);
      const doc = parser.parseFromString(await zip.readText(navPath), 'text/html');
      const nav = [...doc.querySelectorAll('nav')].find((element) => {
        const type = [...element.attributes].find((attr) => attr.localName === 'type')?.value || '';
        return type.split(/\s+/).includes('toc') || element.getAttribute('role') === 'doc-toc';
      });
      const labels = new Map();
      for (const anchor of nav?.querySelectorAll('a[href]') || []) {
        const path = normalizeArchivePath(navPath, anchor.getAttribute('href'));
        const label = anchor.textContent.trim();
        if (path && label && !labels.has(path)) labels.set(path, label);
      }
      if (labels.size) return labels;
    } catch {
      // 目录损坏时继续尝试 EPUB 2 的 NCX 目录。
    }
  }
  const ncxItem = [...manifest.values()].find((item) => /ncx/i.test(item.mediaType));
  if (!ncxItem) return new Map();
  try {
    const ncxPath = normalizeArchivePath(packagePath, ncxItem.href);
    const ncx = parser.parseFromString(await zip.readText(ncxPath), 'application/xml');
    assertXml(ncx, 'EPUB 目录');
    const labels = new Map();
    for (const point of elementsByName(ncx, 'navPoint')) {
      const source = elementsByName(point, 'content')[0]?.getAttribute('src');
      const label = elementsByName(point, 'text')[0]?.textContent?.trim();
      if (source && label) labels.set(normalizeArchivePath(ncxPath, source), label);
    }
    return labels;
  } catch {
    return new Map();
  }
}

async function readEpubPackage(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('EPUB 文件超过 150 MB，暂不导入。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const zip = ZipArchive.from(bytes);
  const containerPath = 'META-INF/container.xml';
  const parser = new DOMParser();
  const container = parser.parseFromString(await zip.readText(containerPath), 'application/xml');
  assertXml(container, 'EPUB 容器');
  const packagePath = elementsByName(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!packagePath) throw new Error('EPUB 容器没有声明书籍目录。');
  const normalizedPackagePath = normalizeArchivePath('', packagePath);
  const opf = parser.parseFromString(await zip.readText(normalizedPackagePath), 'application/xml');
  assertXml(opf, 'EPUB 书籍目录');
  const manifest = new Map();
  for (const item of elementsByName(opf, 'item')) {
    const id = item.getAttribute('id');
    if (id) manifest.set(id, {
      href: item.getAttribute('href') || '',
      mediaType: item.getAttribute('media-type') || '',
      properties: item.getAttribute('properties') || '',
    });
  }
  return { zip, parser, opf, manifest, packagePath: normalizedPackagePath };
}

async function packageCover({ zip, parser, opf, manifest, packagePath }) {
  const metadataCoverIds = elementsByName(opf, 'meta')
    .filter((meta) => meta.getAttribute('name')?.toLowerCase() === 'cover')
    .map((meta) => meta.getAttribute('content'));
  const guideReferences = elementsByName(opf, 'reference')
    .filter((reference) => (reference.getAttribute('type') || '').split(/\s+/).includes('cover'))
    .map((reference) => ({ href: reference.getAttribute('href') || '', mediaType: '' }));
  const seen = new Set();
  const readImage = async (path) => {
    if (!path || seen.has(path)) return null;
    seen.add(path);
    return makeBookCover(await zip.read(path, MAX_COVER_SOURCE_BYTES), path);
  };
  for (const candidate of coverCandidates(manifest, metadataCoverIds, guideReferences)) {
    const path = coverArchivePath(packagePath, candidate.href);
    if (!path) continue;
    try {
      const isPage = /(?:xhtml|html|svg)/i.test(candidate.mediaType || '') || /\.(x?html?|svg)$/i.test(path);
      if (!isPage) {
        const cover = await readImage(path);
        if (cover) return cover;
        continue;
      }
      // 用 XML 解析离线封面页，不把 HTML / SVG 插入 DOM，也不加载其外部资源。
      const page = parser.parseFromString(await zip.readText(path, 512 * 1024), 'application/xml');
      assertXml(page, 'EPUB 封面页');
      for (const element of [...elementsByName(page, 'img'), ...elementsByName(page, 'image')]) {
        const href = attribute(element, 'src') || attribute(element, 'href');
        try {
          const cover = await readImage(coverArchivePath(path, href));
          if (cover) return cover;
        } catch { /* 单张坏图不影响下一个封面候选。 */ }
      }
    } catch { /* 封面缺失、损坏或过大时继续尝试，正文仍然可读。 */ }
  }
  return null;
}

export async function extractEpubCover(file) {
  return packageCover(await readEpubPackage(file));
}

export async function parseEpub(file) {
  const context = await readEpubPackage(file);
  const { zip, parser, opf, manifest, packagePath: normalizedPackagePath } = context;
  const labels = await tableOfContents(zip, manifest, normalizedPackagePath, parser);
  const chapters = [];
  for (const itemref of elementsByName(opf, 'itemref')) {
    if (itemref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(itemref.getAttribute('idref'));
    if (!item || !/xhtml|html/i.test(item.mediaType)) continue;
    const path = normalizeArchivePath(normalizedPackagePath, item.href);
    const parsed = parseHtml(await zip.readText(path), path);
    if (!parsed.paragraphs.length) continue;
    const heading = parsed.paragraphs.find((block) => block.kind === 'heading')?.text;
    chapters.push({
      id: `chapter-${chapters.length + 1}`,
      title: labels.get(path) || heading || parsed.title || `第 ${chapters.length + 1} 章`,
      paragraphs: parsed.paragraphs,
    });
  }
  if (!chapters.length) throw new Error('没有找到可读取的 EPUB 正文。');
  const metadata = elementsByName(opf, 'title')[0]?.textContent?.trim();
  return { title: metadata || file.name.replace(/\.epub$/i, ''), chapters, cover: await packageCover(context) };
}
