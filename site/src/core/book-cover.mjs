// 只接受本机提取的栅格图片，备份不能引入外链、SVG 或可执行 HTML。
export const MAX_COVER_BYTES = 1024 * 1024;
export const MAX_COVER_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_COVER_PIXELS = 24_000_000;
const MAX_COVER_SIDE = 900;

export function rasterInfo(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let mime = '';
  let width = 0;
  let height = 0;
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    && view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452) {
    mime = 'image/png';
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg';
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (length < 8) return null;
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  } else if (bytes.length >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    mime = 'image/webp';
    const chunk = view.getUint32(12);
    if (chunk === 0x56503858) {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === 0x5650384c && bytes[20] === 0x2f) {
      width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    } else if (chunk === 0x56503820 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    }
  }
  return mime && width > 0 && height > 0 && width <= 16_384 && height <= 16_384
    && width * height <= MAX_COVER_PIXELS ? { mime, width, height } : null;
}

export function coverArchivePath(baseFile, href) {
  if (typeof href !== 'string' || !href.trim()) return null;
  let value;
  try { value = decodeURIComponent(href.split('#')[0].split('?')[0]); } catch { return null; }
  if (!value || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('/') || /[\\\u0000-\u001f]/.test(value)) return null;
  const pieces = String(baseFile || '').split('/').slice(0, -1);
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!pieces.length) return null;
      pieces.pop();
    } else pieces.push(part);
  }
  return pieces.join('/') || null;
}

export function coverCandidates(manifest, metadataCoverIds, guideReferences) {
  const entries = [...manifest.entries()];
  const candidates = [];
  const add = (item) => {
    if (item?.href && !candidates.some((candidate) => candidate.href === item.href)) candidates.push(item);
  };
  for (const [, item] of entries) if ((item.properties || '').split(/\s+/).includes('cover-image')) add(item);
  for (const id of metadataCoverIds) add(manifest.get(id));
  for (const item of guideReferences) add(item);
  for (const [id, item] of entries) {
    const filename = item.href?.split('/').pop()?.split(/[?#]/)[0] || '';
    if (/^image\/(jpeg|png|webp)$/i.test(item.mediaType || '')
      && (/^(cover|cover[-_]?image|front[-_]?cover)$/i.test(id) || /^(cover|front[-_]?cover)([-_]image)?\.(jpe?g|png|webp)$/i.test(filename))) add(item);
  }
  return candidates;
}

export function isValidBookCover(cover) {
  if (!cover || cover.source !== 'epub' || typeof cover.path !== 'string' || cover.path.length > 2000
    || coverArchivePath('', cover.path) !== cover.path || typeof cover.dataUrl !== 'string'
    || cover.dataUrl.length > Math.ceil(MAX_COVER_BYTES / 3) * 4 + 32) return false;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(cover.dataUrl);
  if (!match || match[2].length % 4 !== 0) return false;
  try {
    const decoded = atob(match[2]);
    if (decoded.length > MAX_COVER_BYTES) return false;
    const info = rasterInfo(Uint8Array.from(decoded, (character) => character.charCodeAt(0)));
    return info?.mime === match[1] && info.width <= MAX_COVER_SIDE && info.height <= MAX_COVER_SIDE;
  } catch { return false; }
}

export function coverDataUrl(book) {
  return isValidBookCover(book?.cover) ? book.cover.dataUrl : '';
}

export async function makeBookCover(bytes, path) {
  if (bytes.length > MAX_COVER_SOURCE_BYTES || coverArchivePath('', path) !== path) return null;
  const info = rasterInfo(bytes);
  if (!info) return null;
  // 解码前先检查文件头尺寸，避免极大图片占用浏览器内存。
  const bitmap = await createImageBitmap(new Blob([bytes], { type: info.mime }));
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_COVER_PIXELS) return null;
    const scale = Math.min(1, MAX_COVER_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const cover = { dataUrl: canvas.toDataURL('image/jpeg', 0.86), source: 'epub', path };
    return isValidBookCover(cover) ? cover : null;
  } finally { bitmap.close(); }
}
