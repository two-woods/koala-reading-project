import { validateGameState } from './core/playground.mjs';
import { isValidBookCover } from './core/book-cover.mjs';

const DB_NAME = 'koala-reading-local';
const DB_VERSION = 1;
const STORE_NAMES = ['books', 'vocabulary', 'annotations', 'settings'];

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地数据库读取失败。'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('本地数据保存失败。'));
    transaction.onabort = () => reject(transaction.error || new Error('本地数据保存已取消。'));
  });
}

export class LocalStore {
  async open() {
    if (this.database) return this.database;
    this.database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('vocabulary')) db.createObjectStore('vocabulary', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('annotations')) db.createObjectStore('annotations', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error('无法打开本地数据库。'));
      request.onblocked = () => reject(new Error('本地数据库正在被其他页面占用，请关闭重复的考拉书房页面后重试。'));
    });
    return this.database;
  }

  async all(name) {
    const db = await this.open();
    const transaction = db.transaction(name, 'readonly');
    const result = await requestResult(transaction.objectStore(name).getAll());
    await transactionDone(transaction);
    return result;
  }

  async get(name, id) {
    const db = await this.open();
    const transaction = db.transaction(name, 'readonly');
    const result = await requestResult(transaction.objectStore(name).get(id));
    await transactionDone(transaction);
    return result;
  }

  async put(name, value) {
    const db = await this.open();
    const transaction = db.transaction(name, 'readwrite');
    const result = await requestResult(transaction.objectStore(name).put(value));
    await transactionDone(transaction);
    return result;
  }

  async remove(name, id) {
    const db = await this.open();
    const transaction = db.transaction(name, 'readwrite');
    transaction.objectStore(name).delete(id);
    await transactionDone(transaction);
  }

  async updateBook(id, versionHash, update) {
    const db = await this.open();
    const transaction = db.transaction('books', 'readwrite');
    const done = transactionDone(transaction);
    const books = transaction.objectStore('books');
    let updated;
    let ruleError;
    const request = books.get(id);
    request.onsuccess = () => {
      try {
        const saved = request.result;
        if (!saved || saved.versionHash !== versionHash) throw new Error('书籍版本已变化，请刷新后重试。');
        updated = update(saved);
        if (updated.id !== id || updated.versionHash !== versionHash) throw new Error('不能改变现有书籍的版本。');
        if (updated.cover != null && !isValidBookCover(updated.cover)) throw new Error('封面图片格式无效。');
        books.put(updated);
      } catch (error) {
        ruleError = error;
        transaction.abort();
      }
    };
    try { await done; }
    catch (error) { throw ruleError || error; }
    return updated;
  }

  async updateGame(update) {
    const db = await this.open();
    const transaction = db.transaction('settings', 'readwrite');
    const done = transactionDone(transaction);
    const settings = transaction.objectStore('settings');
    let updated;
    let ruleError;
    const request = settings.get('koala-game');
    request.onsuccess = () => {
      try {
        updated = update(request.result);
        validateGameState(updated);
        if (updated !== request.result) settings.put(updated);
      } catch (error) {
        ruleError = error;
        transaction.abort();
      }
    };
    try { await done; }
    catch (error) { throw ruleError || error; }
    return updated;
  }

  async getDictionary() {
    return (await this.get('settings', 'dictionary'))?.entries || [];
  }

  async setDictionary(entries) {
    await this.put('settings', { id: 'dictionary', entries, updatedAt: Date.now() });
  }

  async exportData() {
    const [books, vocabulary, annotations, settings] = await Promise.all(STORE_NAMES.map((name) => this.all(name)));
    return {
      format: 'koala-reading-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      books,
      vocabulary,
      annotations,
      settings,
    };
  }

  async mergeBackup(data) {
    validateBackup(data);
    for (const name of STORE_NAMES) {
      for (const record of data[name]) {
        if (!(await this.get(name, record.id))) await this.put(name, record);
      }
    }
  }
}

function validateBackup(data) {
  if (!data || data.format !== 'koala-reading-backup' || data.version !== 1) throw new Error('备份文件格式或版本不受支持。');
  for (const name of STORE_NAMES) {
    if (!Array.isArray(data[name])) throw new Error(`备份缺少有效的 ${name} 数据。`);
    if (data[name].some((record) => !record || !shortString(record.id, 200))) throw new Error(`${name} 中存在无效记录。`);
  }
  if (data.settings.length > 100 || data.books.length > 1000 || data.vocabulary.length > 100_000 || data.annotations.length > 100_000) {
    throw new Error('备份记录数超过安全上限。');
  }
  for (const book of data.books) {
    if (!shortString(book.title, 500) || !shortString(book.fileName, 500)
      || !['epub', 'txt', 'md', 'markdown'].includes(book.format)
      || !/^[a-f0-9]{64}$/i.test(book.versionHash || '')
      || !Array.isArray(book.chapters) || book.chapters.length === 0 || book.chapters.length > 5000
      || !Number.isFinite(book.importedAt) || !Number.isFinite(book.progress) || book.progress < 0 || book.progress > 100
      || book.chapters.some((chapter) => !chapter || !shortString(chapter.id, 200)
        || !shortString(chapter.title, 1000) || !Array.isArray(chapter.paragraphs)
        || chapter.paragraphs.length > 100_000
        || chapter.paragraphs.some((paragraph) => !paragraph
          || !['heading', 'paragraph'].includes(paragraph.kind)
          || typeof paragraph.text !== 'string' || paragraph.text.length > 2_000_000))) {
      throw new Error('备份中存在无效的读物记录。');
    }
    if ((book.cover != null && !isValidBookCover(book.cover))
      || (book.coverCheckedAt !== undefined && (!Number.isFinite(book.coverCheckedAt) || book.coverCheckedAt < 0))) {
      throw new Error('备份中存在无效的封面记录。');
    }
    if (book.externalSource !== undefined && (!book.externalSource
      || book.externalSource.repository !== 'hehonghui/awesome-english-ebooks'
      || typeof book.externalSource.path !== 'string' || book.externalSource.path.length > 2000
      || book.externalSource.path.includes('\\')
      || book.externalSource.path.split('/').some((part) => !part || part === '.' || part === '..')
      || !book.externalSource.path.toLocaleLowerCase().endsWith('.epub')
      || !/^[a-f0-9]{40,64}$/i.test(book.externalSource.sha || ''))) {
      throw new Error('备份中存在无效的外刊来源信息。');
    }
  }
  for (const card of data.vocabulary) {
    if (!shortString(card.term, 500) || typeof card.sentence !== 'string' || card.sentence.length > 20_000
      || typeof card.definitionSnapshot !== 'string' || card.definitionSnapshot.length > 10_000
      || (card.dictionarySource !== undefined && !shortString(card.dictionarySource, 160))
      || !shortString(card.bookId, 200) || !/^[a-f0-9]{64}$/i.test(card.bookVersion || '')
      || !shortString(card.chapterId, 200) || !Number.isInteger(card.paragraphIndex) || card.paragraphIndex < 0
      || !Number.isInteger(card.startOffset) || card.startOffset < 0
      || !Number.isInteger(card.endOffset) || card.endOffset < card.startOffset
      || !Number.isFinite(card.dueAt)) {
      throw new Error('备份中存在无效的词条记录。');
    }
  }
  for (const annotation of data.annotations) {
    if (!['mark', 'note'].includes(annotation.type) || !shortString(annotation.quote, 500)
      || typeof annotation.note !== 'string' || annotation.note.length > 20_000
      || !shortString(annotation.bookId, 200) || !/^[a-f0-9]{64}$/i.test(annotation.bookVersion || '')
      || !shortString(annotation.chapterId, 200) || !Number.isInteger(annotation.paragraphIndex) || annotation.paragraphIndex < 0
      || !Number.isInteger(annotation.startOffset) || annotation.startOffset < 0
      || !Number.isInteger(annotation.endOffset) || annotation.endOffset < annotation.startOffset) {
      throw new Error('备份中存在无效的标记或笔记。');
    }
  }
  for (const setting of data.settings) {
    if (setting.id === 'dictionary') {
      if (!Array.isArray(setting.entries) || setting.entries.length > 500_000
        || setting.entries.some((entry) => !entry || !shortString(entry.word, 1000)
          || typeof entry.definition !== 'string' || entry.definition.length > 20_000)) {
        throw new Error('备份中存在无效的词典数据。');
      }
    } else if (setting.id === 'koala-game') {
      try { validateGameState(setting); }
      catch { throw new Error('备份中存在无效的考拉乐园数据。'); }
    } else {
      throw new Error('备份中包含未知的设置记录。');
    }
  }
}

function shortString(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

export { validateBackup };
