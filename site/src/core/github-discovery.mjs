export const GITHUB_REPOSITORY = 'hehonghui/awesome-english-ebooks';
export const GITHUB_DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const API_ROOT = 'https://api.github.com/repos/hehonghui/awesome-english-ebooks';
const SUPPORTED_EXTENSIONS = new Set(['epub', 'pdf', 'mobi']);
const MAX_TREE_ENTRIES = 100_000;

export function emptyDiscoveryState() {
  return {
    repository: GITHUB_REPOSITORY,
    repositoryUrl: `https://github.com/${GITHUB_REPOSITORY}`,
    branch: '',
    repositoryUpdatedAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    etag: null,
    resources: [],
    changes: { added: [], updated: [], removed: [] },
    history: [],
    autoIssueShas: {},
    pendingAutoImports: [],
    autoImportErrors: [],
  };
}

export function extractBookResources(entries, branch) {
  if (!Array.isArray(entries) || entries.length > MAX_TREE_ENTRIES) {
    throw new Error('GitHub 返回的目录清单超出可处理范围。');
  }
  if (typeof branch !== 'string' || !branch || branch.length > 255) {
    throw new Error('GitHub 仓库分支信息无效。');
  }

  return entries.flatMap((entry) => {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string'
      || entry.path.length > 2000 || entry.path.includes('\\')
      || entry.path.split('/').some((part) => !part || part === '.' || part === '..')
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || typeof entry.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(entry.sha)) return [];
    const filename = entry.path.split('/').at(-1);
    const extension = filename.split('.').at(-1)?.toLocaleLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) return [];
    const encodedPath = entry.path.split('/').map(encodeURIComponent).join('/');
    const url = `https://github.com/${GITHUB_REPOSITORY}/blob/${encodeURIComponent(branch)}/${encodedPath}`;
    return [{
      id: entry.path,
      path: entry.path,
      name: filename.slice(0, -(extension.length + 1)),
      format: extension.toLocaleUpperCase(),
      size: entry.size,
      sha: entry.sha.toLocaleLowerCase(),
      url,
    }];
  }).sort((a, b) => a.path.localeCompare(b.path));
}

export function compareResources(previous = [], current = [], detectedAt = new Date().toISOString()) {
  const before = new Map(previous.map((item) => [item.path, item]));
  const after = new Map(current.map((item) => [item.path, item]));
  const added = current.filter((item) => !before.has(item.path));
  const updated = current.filter((item) => before.has(item.path) && before.get(item.path).sha !== item.sha);
  const removed = previous.filter((item) => !after.has(item.path));
  const events = [
    ...added.map((item) => ({ id: `added:${item.path}:${detectedAt}`, type: 'added', path: item.path, format: item.format, detectedAt })),
    ...updated.map((item) => ({ id: `updated:${item.path}:${detectedAt}`, type: 'updated', path: item.path, format: item.format, detectedAt })),
    ...removed.map((item) => ({ id: `removed:${item.path}:${detectedAt}`, type: 'removed', path: item.path, format: item.format, detectedAt })),
  ];
  return { changes: { added, updated, removed }, events };
}

function issueDate(path) {
  const matches = [...path.matchAll(/(?:^|[^\d])(20\d{2})[._/-](\d{1,2})[._/-](\d{1,2})(?=$|[^\d])/g)];
  return matches.reduce((latest, match) => {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return latest;
    return Math.max(latest, year * 10_000 + month * 100 + day);
  }, 0);
}

export function selectLatestEpubs(resources = []) {
  const latestByPublication = new Map();
  for (const item of resources) {
    if (!item || typeof item.path !== 'string' || !(item.format?.toUpperCase() === 'EPUB' || item.path.toLocaleLowerCase().endsWith('.epub'))) continue;
    const publication = item.path.split('/')[0];
    if (!publication) continue;
    const previous = latestByPublication.get(publication);
    const date = issueDate(item.path);
    const previousDate = previous ? issueDate(previous.path) : -1;
    if (!previous || date > previousDate || (date === previousDate && item.path.localeCompare(previous.path) > 0)) {
      latestByPublication.set(publication, { ...item, publication });
    }
  }
  return [...latestByPublication.values()].sort((a, b) => a.publication.localeCompare(b.publication));
}

export function latestEpubForSelectedResource(resources = [], selected) {
  if (typeof selected?.path !== 'string') return null;
  const publication = selected.path.split('/')[0];
  return selectLatestEpubs(resources).find((item) => item.publication === publication) || null;
}

export function validateDiscoveryState(value) {
  if (!value || value.repository !== GITHUB_REPOSITORY
    || !Array.isArray(value.resources) || !Array.isArray(value.history)
    || !value.changes || !['added', 'updated', 'removed'].every((key) => Array.isArray(value.changes[key]))) {
    throw new Error('本地资源索引格式无效。');
  }
  const resources = extractBookResources(value.resources.map((item) => ({
    type: 'blob', path: item.path, size: item.size, sha: item.sha,
  })), value.branch || 'master');
  const autoIssueShas = Object.fromEntries(Object.entries(value.autoIssueShas || {}).filter(([publication, sha]) =>
    typeof publication === 'string' && /^[a-z0-9_.-]{1,100}$/i.test(publication)
      && typeof sha === 'string' && /^[a-f0-9]{40,64}$/i.test(sha)));
  const pendingAutoImports = [];
  for (const item of (Array.isArray(value.pendingAutoImports) ? value.pendingAutoImports : []).slice(0, 100)) {
    const [resource] = extractBookResources([{
      type: 'blob', path: item?.path, size: item?.size, sha: item?.sha,
    }], value.branch || 'master');
    if (resource?.format === 'EPUB' && !pendingAutoImports.some((pending) => pending.sha === resource.sha)) {
      pendingAutoImports.push({
        ...resource,
        publication: resource.path.split('/')[0],
        queuedAt: typeof item.queuedAt === 'string' ? item.queuedAt : null,
      });
    }
  }
  return {
    ...emptyDiscoveryState(),
    branch: value.branch || '',
    repositoryUpdatedAt: typeof value.repositoryUpdatedAt === 'string' ? value.repositoryUpdatedAt : null,
    lastAttemptAt: typeof value.lastAttemptAt === 'string' ? value.lastAttemptAt : null,
    lastSuccessAt: typeof value.lastSuccessAt === 'string' ? value.lastSuccessAt : null,
    lastError: typeof value.lastError === 'string' ? value.lastError.slice(0, 300) : null,
    etag: typeof value.etag === 'string' ? value.etag.slice(0, 500) : null,
    resources,
    changes: Object.fromEntries(['added', 'updated', 'removed'].map((key) => [
      key,
      extractBookResources(value.changes[key].slice(0, 1000).map((item) => ({
        type: 'blob', path: item?.path, size: item?.size, sha: item?.sha,
      })), value.branch || 'master'),
    ])),
    history: value.history.slice(-200).filter((item) => item && typeof item.path === 'string'
      && item.path.length <= 2000 && ['added', 'updated', 'removed'].includes(item.type)
      && typeof item.detectedAt === 'string'),
    autoIssueShas,
    pendingAutoImports,
    autoImportErrors: (Array.isArray(value.autoImportErrors) ? value.autoImportErrors : []).slice(-20)
      .filter((item) => item && typeof item.path === 'string' && item.path.length <= 2000
        && typeof item.message === 'string' && typeof item.failedAt === 'string')
      .map((item) => ({
        path: item.path, message: item.message.slice(0, 300), failedAt: item.failedAt,
        ...(typeof item.sha === 'string' && /^[a-f0-9]{40,64}$/i.test(item.sha) ? { sha: item.sha.toLocaleLowerCase() } : {}),
        ...(['server', 'browser'].includes(item.source) ? { source: item.source } : {}),
      })),
  };
}

export function createGithubDiscoveryService({
  fetchImpl = globalThis.fetch,
  readSnapshot = async () => emptyDiscoveryState(),
  writeSnapshot = async () => {},
  now = () => Date.now(),
} = {}) {
  let snapshotPromise;
  let snapshot;
  let inFlight;

  async function getSnapshot() {
    if (!snapshotPromise) {
      snapshotPromise = Promise.resolve(readSnapshot()).then((value) => {
        try { snapshot = validateDiscoveryState(value); }
        catch { snapshot = emptyDiscoveryState(); }
        return snapshot;
      });
    }
    await snapshotPromise;
    return structuredClone({ ...snapshot, syncing: Boolean(inFlight) });
  }

  async function persist(next) {
    snapshot = next;
    await writeSnapshot(structuredClone(next));
  }

  async function queueAutoImport(value, queuedAt = new Date(now()).toISOString()) {
    await getSnapshot();
    const [resource] = extractBookResources([{
      type: 'blob', path: value?.path, size: value?.size, sha: value?.sha,
    }], snapshot.branch || 'master');
    if (!resource || resource.format !== 'EPUB') throw new Error('自动入架只支持有效的 EPUB 资源。');
    const publication = resource.path.split('/')[0];
    if (snapshot.autoIssueShas[publication] === resource.sha
      || snapshot.pendingAutoImports.some((item) => item.sha === resource.sha)) return structuredClone(snapshot);
    const next = {
      ...snapshot,
      autoIssueShas: { ...snapshot.autoIssueShas, [publication]: resource.sha },
      pendingAutoImports: [...snapshot.pendingAutoImports, { ...resource, publication, queuedAt }].slice(-100),
      autoImportErrors: snapshot.autoImportErrors.filter((item) => item.path !== resource.path),
    };
    await persist(next);
    return structuredClone(next);
  }

  async function acknowledgeAutoImport(sha) {
    await getSnapshot();
    const next = { ...snapshot, pendingAutoImports: snapshot.pendingAutoImports.filter((item) => item.sha !== sha) };
    if (next.pendingAutoImports.length === snapshot.pendingAutoImports.length) return structuredClone(snapshot);
    await persist(next);
    return structuredClone(next);
  }

  async function markIssueImported(path, sha) {
    await getSnapshot();
    const latest = selectLatestEpubs(snapshot.resources).find((item) => item.path === path && item.sha === sha);
    const pending = snapshot.pendingAutoImports.some((item) => item.sha === sha);
    if (!latest && !pending) return structuredClone(snapshot);
    const publication = latest?.publication || snapshot.pendingAutoImports.find((item) => item.sha === sha)?.publication;
    const next = {
      ...snapshot,
      autoIssueShas: latest ? { ...snapshot.autoIssueShas, [publication]: sha } : snapshot.autoIssueShas,
      pendingAutoImports: snapshot.pendingAutoImports.filter((item) => item.sha !== sha),
      autoImportErrors: snapshot.autoImportErrors.filter((item) => item.path !== path),
    };
    await persist(next);
    return structuredClone(next);
  }

  async function recordAutoImportError(path, message, failedAt = new Date(now()).toISOString(), sha = null, source = null) {
    await getSnapshot();
    const next = {
      ...snapshot,
      autoImportErrors: [...snapshot.autoImportErrors.filter((item) => item.path !== path), {
        path: String(path).slice(0, 2000), message: String(message).slice(0, 300), failedAt,
        ...(typeof sha === 'string' && /^[a-f0-9]{40,64}$/i.test(sha) ? { sha: sha.toLocaleLowerCase() } : {}),
        ...(['server', 'browser'].includes(source) ? { source } : {}),
      }].slice(-20),
    };
    await persist(next);
    return structuredClone(next);
  }

  async function recordBrowserCatalog(value) {
    await getSnapshot();
    if (value?.repository !== GITHUB_REPOSITORY || typeof value.branch !== 'string'
      || !value.branch || value.branch.length > 255 || !Array.isArray(value.resources)
      || value.resources.length > MAX_TREE_ENTRIES) {
      throw new Error('GitHub 目录响应格式无效。');
    }
    const checkedAt = new Date(now()).toISOString();
    const resources = extractBookResources(value.resources.map((item) => ({
      type: 'blob', path: item?.path, size: item?.size, sha: item?.sha,
    })), value.branch);
    const uniqueResources = [...new Map(resources.map((item) => [item.path, item])).values()];
    const { changes, events } = compareResources(snapshot.resources, uniqueResources, checkedAt);
    const liveShas = new Map(uniqueResources.map((item) => [item.path, item.sha]));
    const next = {
      ...snapshot,
      branch: value.branch,
      repositoryUpdatedAt: typeof value.repositoryUpdatedAt === 'string' ? value.repositoryUpdatedAt.slice(0, 100) : null,
      lastAttemptAt: checkedAt,
      lastSuccessAt: checkedAt,
      lastError: null,
      etag: typeof value.etag === 'string' ? value.etag.slice(0, 500) : null,
      resources: uniqueResources,
      changes,
      history: [...snapshot.history, ...events].slice(-200),
      autoImportErrors: snapshot.autoImportErrors.filter((item) => item.source === 'server' && item.sha && liveShas.get(item.path) === item.sha),
    };
    await persist(next);
    return structuredClone(next);
  }

  async function sync() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      await getSnapshot();
      const previous = structuredClone(snapshot);
      const attemptedAt = new Date(now()).toISOString();
      try {
        if (typeof fetchImpl !== 'function') throw new Error('当前 Node.js 环境不支持网络请求。');
        const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'KoalaReadingLocal/0.2', 'X-GitHub-Api-Version': '2022-11-28' };
        const repositoryResponse = await fetchImpl(API_ROOT, { headers, signal: AbortSignal.timeout(15_000) });
        if (!repositoryResponse.ok) throw new Error(`GitHub 仓库信息请求失败（HTTP ${repositoryResponse.status}）。`);
        const repository = await repositoryResponse.json();
        if (repository?.full_name?.toLocaleLowerCase() !== GITHUB_REPOSITORY
          || typeof repository.default_branch !== 'string' || !repository.default_branch
          || repository.default_branch.length > 255) {
          throw new Error('GitHub 仓库响应格式无效。');
        }

        const treeHeaders = { ...headers };
        if (previous.branch === repository.default_branch && previous.etag) treeHeaders['If-None-Match'] = previous.etag;
        const treeUrl = `${API_ROOT}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`;
        const treeResponse = await fetchImpl(treeUrl, { headers: treeHeaders, signal: AbortSignal.timeout(15_000) });
        const checkedAt = new Date(now()).toISOString();
        if (treeResponse.status === 304 && previous.branch === repository.default_branch) {
          const next = {
            ...previous,
            branch: repository.default_branch,
            repositoryUpdatedAt: typeof repository.updated_at === 'string' ? repository.updated_at : null,
            lastAttemptAt: attemptedAt,
            lastSuccessAt: checkedAt,
            lastError: null,
            changes: { added: [], updated: [], removed: [] },
          };
          await persist(next);
          return structuredClone(next);
        }
        if (!treeResponse.ok) throw new Error(`GitHub 文件目录请求失败（HTTP ${treeResponse.status}）。`);
        const tree = await treeResponse.json();
        if (tree?.truncated === true) throw new Error('GitHub 返回的目录不完整，本次索引未替换旧数据。');
        const resources = extractBookResources(tree?.tree, repository.default_branch);
        const { changes, events } = compareResources(previous.resources, resources, checkedAt);
        const next = {
          ...previous,
          branch: repository.default_branch,
          repositoryUpdatedAt: typeof repository.updated_at === 'string' ? repository.updated_at : null,
          lastAttemptAt: attemptedAt,
          lastSuccessAt: checkedAt,
          etag: treeResponse.headers?.get?.('etag') || null,
          resources,
          changes,
          history: [...previous.history, ...events].slice(-200),
        };
        await persist(next);
        return structuredClone(next);
      } catch (error) {
        const next = {
          ...previous,
          lastAttemptAt: attemptedAt,
          lastError: String(error?.message || '同步失败。').slice(0, 300),
          changes: { added: [], updated: [], removed: [] },
        };
        try { await persist(next); } catch { snapshot = next; }
        return structuredClone(next);
      }
    })();
    try { return await inFlight; }
    finally { inFlight = null; }
  }

  return { getSnapshot, sync, queueAutoImport, acknowledgeAutoImport, markIssueImported, recordAutoImportError, recordBrowserCatalog };
}
