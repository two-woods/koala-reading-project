import { validateGameState } from './core/playground.mjs';
import { isValidBookCover } from './core/book-cover.mjs';

const STORE_NAMES = ['books', 'vocabulary', 'annotations', 'settings'];
const BOOK_PATCH_FIELDS = new Set([
  'currentChapterId', 'scrollY', 'progress', 'positions', 'lastReadAt', 'cover', 'coverCheckedAt',
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function requireStore(name) {
  if (!STORE_NAMES.includes(name)) throw new Error('云端数据类别无效。');
}

export class CloudStore extends EventTarget {
  constructor({ pollIntervalMs = 10_000 } = {}) {
    super();
    this.records = new Map(STORE_NAMES.map((name) => [name, new Map()]));
    this.recordRevisions = new Map(STORE_NAMES.map((name) => [name, new Map()]));
    this.revision = 0;
    this.opened = false;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimer = null;
    this.visibilityListener = () => {
      if (document.visibilityState === 'visible') void this.syncChanges();
    };
    this.pageHideListener = () => this.close();
  }

  async open() {
    await this.refreshSnapshot();
    this.opened = true;
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncChanges();
    }, this.pollIntervalMs);
    document.addEventListener('visibilitychange', this.visibilityListener);
    window.addEventListener('pagehide', this.pageHideListener, { once: true });
    return this;
  }

  close() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
    document.removeEventListener('visibilitychange', this.visibilityListener);
    window.removeEventListener('pagehide', this.pageHideListener);
  }

  async request(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store',
      ...options,
      ...(options.body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: JSON.stringify(options.body),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `服务器请求失败（${response.status}）。`);
    return result;
  }

  async refreshSnapshot() {
    const snapshot = await this.request('/api/cloud/state');
    this.applySnapshot(snapshot);
    return snapshot;
  }

  applySnapshot(snapshot) {
    this.revision = snapshot.revision;
    for (const name of STORE_NAMES) {
      this.records.get(name).clear();
      this.recordRevisions.get(name).clear();
      for (const record of snapshot[name]) this.records.get(name).set(record.id, clone(record));
      for (const [id, revision] of Object.entries(snapshot.recordRevisions[name] || {})) {
        this.recordRevisions.get(name).set(id, revision);
      }
    }
  }

  async syncChanges() {
    if (!this.opened || this.syncPromise) return this.syncPromise;
    this.syncPromise = this.request(`/api/cloud/changes?since=${this.revision}`).then(async (result) => {
      const affectedStores = new Set();
      for (const change of result.changes) {
        const records = this.records.get(change.store);
        const revisions = this.recordRevisions.get(change.store);
        if (!records || !revisions) continue;
        affectedStores.add(change.store);
        if (change.operation === 'delete') {
          records.delete(change.id);
          revisions.delete(change.id);
        } else if (change.operation === 'patch') {
          const current = records.get(change.id);
          if (current) {
            records.set(change.id, { ...current, ...clone(change.patch) });
            revisions.set(change.id, change.recordRevision);
          } else {
            await this.refreshSnapshot();
            break;
          }
        } else {
          records.set(change.id, clone(change.record));
          revisions.set(change.id, change.recordRevision);
        }
      }
      this.revision = result.revision;
      if (affectedStores.size) {
        this.dispatchEvent(new CustomEvent('remotechange', { detail: { stores: [...affectedStores] } }));
      }
      return result;
    }).catch((error) => {
      this.dispatchEvent(new CustomEvent('syncerror', { detail: { error } }));
      return null;
    }).finally(() => { this.syncPromise = null; });
    return this.syncPromise;
  }

  async all(name) {
    requireStore(name);
    return [...this.records.get(name).values()].map(clone);
  }

  async get(name, id) {
    requireStore(name);
    return clone(this.records.get(name).get(id));
  }

  async put(name, value) {
    requireStore(name);
    const record = clone(value);
    const expectedRevision = this.recordRevisions.get(name).get(record.id) ?? null;
    const result = await this.request(`/api/cloud/records/${name}/${encodeURIComponent(record.id)}`, {
      method: 'PUT', body: { record, expectedRevision },
    });
    this.records.get(name).set(record.id, record);
    this.recordRevisions.get(name).set(record.id, result.recordRevision);
    this.revision = result.revision;
    return clone(record);
  }

  async remove(name, id) {
    requireStore(name);
    const expectedRevision = this.recordRevisions.get(name).get(id);
    if (expectedRevision === undefined) return;
    const result = await this.request(`/api/cloud/records/${name}/${encodeURIComponent(id)}?revision=${expectedRevision}`, { method: 'DELETE' });
    if (result.removed) {
      this.records.get(name).delete(id);
      this.recordRevisions.get(name).delete(id);
    }
    this.revision = result.revision;
  }

  async updateBook(id, versionHash, update) {
    const saved = await this.get('books', id);
    if (!saved || saved.versionHash !== versionHash) throw new Error('书籍版本已变化，请刷新后重试。');
    const updated = update(saved);
    if (updated.id !== id || updated.versionHash !== versionHash) throw new Error('不能改变现有书籍的版本。');
    if (updated.cover != null && !isValidBookCover(updated.cover)) throw new Error('封面图片格式无效。');
    const changedFields = [...new Set([...Object.keys(saved), ...Object.keys(updated)])]
      .filter((field) => JSON.stringify(saved[field]) !== JSON.stringify(updated[field]));
    if (changedFields.length && changedFields.every((field) => BOOK_PATCH_FIELDS.has(field))) {
      const patch = Object.fromEntries(changedFields.map((field) => [field, updated[field] === undefined ? null : updated[field]]));
      const expectedRevision = this.recordRevisions.get('books').get(id);
      const result = await this.request(`/api/cloud/records/books/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { patch, expectedRevision },
      });
      this.records.get('books').set(id, clone(updated));
      this.recordRevisions.get('books').set(id, result.recordRevision);
      this.revision = result.revision;
      return clone(updated);
    }
    return this.put('books', updated);
  }

  async updateGame(update) {
    const saved = await this.get('settings', 'koala-game');
    const updated = update(saved);
    validateGameState(updated);
    if (updated !== saved) await this.put('settings', updated);
    return clone(updated);
  }

  async getDictionary() {
    return (await this.get('settings', 'dictionary'))?.entries || [];
  }

  async setDictionary(entries) {
    await this.put('settings', { id: 'dictionary', entries, updatedAt: Date.now() });
  }

  async exportData() {
    const snapshot = await this.refreshSnapshot();
    return Object.fromEntries([
      ['format', snapshot.format], ['version', snapshot.version], ['exportedAt', new Date().toISOString()],
      ...STORE_NAMES.map((name) => [name, snapshot[name]]),
    ]);
  }

  async mergeBackup(data) {
    await this.request('/api/cloud/merge', { method: 'POST', body: data });
    await this.refreshSnapshot();
  }
}
