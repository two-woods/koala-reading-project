const SOURCE = 'ECDICT 免费英汉词库';

export function createEcdictLookup(fetchImpl = globalThis.fetch, moduleUrl = import.meta.url) {
  const cache = new Map();
  return async (term) => {
    const word = String(term || '').trim().toLocaleLowerCase().replaceAll('’', "'");
    if (!word || word.length > 160) return null;
    const key = /^[a-z]$/.test(word[0]) ? word[0] : '_';
    let request = cache.get(key);
    if (!request) {
      request = (async () => {
        const assetUrl = new URL(`../../assets/dictionaries/ecdict/${key}.json`, moduleUrl).href;
        const response = await fetchImpl(assetUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('本地 ECDICT 词库读取失败。');
        if (Number(response.headers.get('content-length')) > 30 * 1024 * 1024) throw new Error('本地词库分片超过大小限制。');
        const data = await response.json();
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('本地词库格式无效。');
        return data;
      })().catch((error) => {
        if (cache.get(key) === request) cache.delete(key);
        throw error;
      });
    }
    cache.delete(key);
    cache.set(key, request);
    if (cache.size > 4) cache.delete(cache.keys().next().value);
    const entries = await request;
    if (!Object.hasOwn(entries, word)) return null;
    const definition = entries[word];
    if (typeof definition !== 'string' || !definition.trim() || definition.length > 10_000) {
      if (cache.get(key) === request) cache.delete(key);
      throw new Error('本地词库词条无效。');
    }
    return { definition, source: SOURCE };
  };
}

export function definitionSource(context, definition) {
  const value = String(definition || '').trim();
  if (!value || !context.dictionarySource || !context.dictionaryDefinition) return '手工填写';
  return value === context.dictionaryDefinition.trim()
    ? context.dictionarySource
    : `${context.dictionarySource}（已手工编辑）`;
}
