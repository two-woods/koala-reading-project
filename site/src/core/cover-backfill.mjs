// 补图必须属于原书版本，不能借用同刊最新一期。
export function findCoverResource(book, resources) {
  const source = book.externalSource;
  if (book.format !== 'epub' || source?.repository !== 'hehonghui/awesome-english-ebooks') return null;
  return resources.find((item) => item.format === 'EPUB' && item.path === source.path && item.sha === source.sha) || null;
}

export async function verifyCoverVersion(bytes, versionHash) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== versionHash) throw new Error('文件与书架中的版本不一致，已保留原书及阅读进度。');
}
