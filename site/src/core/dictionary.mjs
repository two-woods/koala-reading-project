function addEntry(map, word, definition) {
  const key = String(word || '').trim().toLocaleLowerCase();
  const value = String(definition || '').trim();
  if (key && value) map.set(key, value);
}

export function parseDictionary(rawText, filename = '') {
  const content = String(rawText || '').replace(/^\uFEFF/, '');
  const map = new Map();
  if (/\.json$/i.test(filename) || /^[\s\[{]/.test(content)) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('JSON 词典格式无效，请检查文件内容。');
    }
    const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (Array.isArray(entries)) {
      for (const entry of entries) addEntry(map, entry?.word ?? entry?.term, entry?.definition ?? entry?.meaning ?? entry?.translation);
    } else if (parsed && typeof parsed === 'object') {
      for (const [word, definition] of Object.entries(parsed)) {
        if (typeof definition === 'string' || typeof definition === 'number') addEntry(map, word, definition);
      }
    } else {
      throw new Error('JSON 词典应为词条数组或“单词: 释义”对象。');
    }
    return map;
  }
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const splitAt = line.indexOf('\t');
    if (splitAt < 0) continue;
    const word = line.slice(0, splitAt).trim();
    const definition = line.slice(splitAt + 1).trim();
    if (index === 0 && /^(word|term|单词)$/i.test(word)) continue;
    addEntry(map, word, definition);
  }
  return map;
}

export function lookupWord(dictionary, term) {
  return dictionary.get(String(term || '').trim().toLocaleLowerCase()) || '';
}
