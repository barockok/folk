import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

const execFileP = promisify(execFile)

const PLUGINS_DIR = join(homedir(), '.claude', 'plugins')
const KNOWN_MARKETPLACES = join(PLUGINS_DIR, 'known_marketplaces.json')
const INSTALLED_PLUGINS = join(PLUGINS_DIR, 'installed_plugins.json')
const MARKETPLACES_DIR = join(PLUGINS_DIR, 'marketplaces')

export interface MarketplaceSource {
  source: 'github' | 'directory' | 'url'
  repo?: string
  path?: string
  url?: string
}

export interface MarketplaceSummary {
  name: string
  description: string
  source: MarketplaceSource
  installLocation: string
  lastUpdated: string | null
  pluginCount: number
}

export interface MarketplacePluginRaw {
  name: string
  description?: string
  category?: string
  author?: string | { name?: string; email?: string }
  homepage?: string
  source?: unknown
}

export interface MarketplacePlugin {
  id: string
  marketplace: string
  name: string
  description: string
  category: string
  author: string
  homepage: string | null
  installed: boolean
}

interface KnownMarketplaceEntry {
  source: MarketplaceSource
  installLocation: string
  lastUpdated: string
}

type KnownMarketplacesFile = Record<string, KnownMarketplaceEntry>

interface InstalledPluginEntry {
  scope: 'user' | 'project'
  projectPath?: string
  installPath: string
  version?: string
  installedAt?: string
  lastUpdated?: string
  gitCommitSha?: string
}

interface InstalledPluginsFile {
  version: number
  plugins: Record<string, InstalledPluginEntry[]>
}

interface MarketplaceManifest {
  name?: string
  description?: string
  plugins?: MarketplacePluginRaw[]
}

async function readJsonSafe<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function readManifest(installLocation: string): Promise<MarketplaceManifest | null> {
  const candidates = [
    join(installLocation, '.claude-plugin', 'marketplace.json'),
    join(installLocation, 'marketplace.json')
  ]
  for (const c of candidates) {
    const m = await readJsonSafe<MarketplaceManifest>(c)
    if (m) return m
  }
  return null
}

function authorString(a: MarketplacePluginRaw['author']): string {
  if (!a) return ''
  if (typeof a === 'string') return a
  return a.name ?? ''
}

export async function listMarketplaces(): Promise<MarketplaceSummary[]> {
  const known = (await readJsonSafe<KnownMarketplacesFile>(KNOWN_MARKETPLACES)) ?? {}
  const out: MarketplaceSummary[] = []
  for (const [name, entry] of Object.entries(known)) {
    const manifest = await readManifest(entry.installLocation)
    out.push({
      name,
      description: manifest?.description ?? '',
      source: entry.source,
      installLocation: entry.installLocation,
      lastUpdated: entry.lastUpdated ?? null,
      pluginCount: manifest?.plugins?.length ?? 0
    })
  }
  return out
}

function installedKeys(installed: InstalledPluginsFile | null): Set<string> {
  if (!installed?.plugins) return new Set()
  return new Set(Object.keys(installed.plugins))
}

export async function listMarketplaceCatalog(): Promise<MarketplacePlugin[]> {
  const known = (await readJsonSafe<KnownMarketplacesFile>(KNOWN_MARKETPLACES)) ?? {}
  const installed = await readJsonSafe<InstalledPluginsFile>(INSTALLED_PLUGINS)
  const installedSet = installedKeys(installed)
  const out: MarketplacePlugin[] = []
  for (const [marketplaceName, entry] of Object.entries(known)) {
    const manifest = await readManifest(entry.installLocation)
    if (!manifest?.plugins) continue
    for (const p of manifest.plugins) {
      if (!p.name) continue
      const installedKey = `${p.name}@${marketplaceName}`
      out.push({
        id: `${marketplaceName}:${p.name}`,
        marketplace: marketplaceName,
        name: p.name,
        description: p.description ?? '',
        category: p.category ?? '',
        author: authorString(p.author),
        homepage: p.homepage ?? null,
        installed: installedSet.has(installedKey)
      })
    }
  }
  return out
}

async function writeKnown(known: KnownMarketplacesFile): Promise<void> {
  await mkdir(PLUGINS_DIR, { recursive: true })
  await writeFile(KNOWN_MARKETPLACES, JSON.stringify(known, null, 2) + '\n', 'utf8')
}

async function writeInstalled(file: InstalledPluginsFile): Promise<void> {
  await mkdir(PLUGINS_DIR, { recursive: true })
  await writeFile(INSTALLED_PLUGINS, JSON.stringify(file, null, 2) + '\n', 'utf8')
}

function parseGithubRepo(input: string): string | null {
  const trimmed = input.trim().replace(/\.git$/, '')
  // Forms: owner/repo, github.com/owner/repo, https://github.com/owner/repo
  const m = trimmed.match(/^(?:https?:\/\/)?(?:github\.com\/)?([^/\s]+)\/([^/\s]+)$/)
  if (!m) return null
  return `${m[1]}/${m[2]}`
}

export interface AddResult {
  ok: boolean
  name?: string
  error?: string
}

export async function addMarketplaceFromGithub(input: string): Promise<AddResult> {
  const repo = parseGithubRepo(input)
  if (!repo) return { ok: false, error: 'Invalid GitHub repo. Use owner/repo or full URL.' }
  const repoBase = basename(repo)
  await mkdir(MARKETPLACES_DIR, { recursive: true })
  const cloneTarget = join(MARKETPLACES_DIR, repoBase)
  if (await pathExists(cloneTarget)) {
    return { ok: false, error: `Folder already exists: ${cloneTarget}` }
  }
  try {
    await execFileP('git', ['clone', '--depth', '1', `https://github.com/${repo}.git`, cloneTarget])
  } catch (err) {
    return { ok: false, error: `git clone failed: ${(err as Error).message}` }
  }
  const manifest = await readManifest(cloneTarget)
  if (!manifest) {
    await rm(cloneTarget, { recursive: true, force: true })
    return { ok: false, error: 'Repo has no .claude-plugin/marketplace.json' }
  }
  const name = manifest.name ?? repoBase
  const known = (await readJsonSafe<KnownMarketplacesFile>(KNOWN_MARKETPLACES)) ?? {}
  if (known[name] && known[name].installLocation !== cloneTarget) {
    await rm(cloneTarget, { recursive: true, force: true })
    return { ok: false, error: `Marketplace already registered: ${name}` }
  }
  known[name] = {
    source: { source: 'github', repo },
    installLocation: cloneTarget,
    lastUpdated: new Date().toISOString()
  }
  await writeKnown(known)
  return { ok: true, name }
}

export async function addMarketplaceFromDirectory(path: string): Promise<AddResult> {
  if (!path.trim()) return { ok: false, error: 'Empty path' }
  const expanded = path.startsWith('~') ? join(homedir(), path.slice(1)) : path
  if (!(await pathExists(expanded))) return { ok: false, error: `Path does not exist: ${expanded}` }
  const manifest = await readManifest(expanded)
  if (!manifest) return { ok: false, error: 'Directory has no .claude-plugin/marketplace.json' }
  const name = manifest.name ?? basename(expanded)
  const known = (await readJsonSafe<KnownMarketplacesFile>(KNOWN_MARKETPLACES)) ?? {}
  known[name] = {
    source: { source: 'directory', path: expanded },
    installLocation: expanded,
    lastUpdated: new Date().toISOString()
  }
  await writeKnown(known)
  return { ok: true, name }
}

export async function removeMarketplace(name: string): Promise<{ ok: boolean; error?: string }> {
  const known = (await readJsonSafe<KnownMarketplacesFile>(KNOWN_MARKETPLACES)) ?? {}
  const entry = known[name]
  if (!entry) return { ok: false, error: 'Marketplace not found' }
  delete known[name]
  await writeKnown(known)
  // Only remove the on-disk dir if it lives under our managed marketplaces
  // folder — never delete user-owned directory sources.
  if (
    entry.source.source !== 'directory' &&
    entry.installLocation.startsWith(MARKETPLACES_DIR + '/')
  ) {
    try {
      await rm(entry.installLocation, { recursive: true, force: true })
    } catch {
      // best effort
    }
  }
  return { ok: true }
}

export interface UninstallTarget {
  name: string
  marketplace: string
  scope: 'user' | 'project'
  projectPath?: string
}

export async function uninstallPlugin(
  target: UninstallTarget
): Promise<{ ok: boolean; error?: string }> {
  const file = await readJsonSafe<InstalledPluginsFile>(INSTALLED_PLUGINS)
  if (!file?.plugins) return { ok: false, error: 'No installed_plugins.json' }
  const key = `${target.name}@${target.marketplace}`
  const entries = file.plugins[key]
  if (!entries || entries.length === 0) return { ok: false, error: 'Plugin not installed' }
  const remaining: InstalledPluginEntry[] = []
  const removed: InstalledPluginEntry[] = []
  for (const e of entries) {
    const sameScope = e.scope === target.scope
    const sameProject =
      target.scope === 'user' || (e.projectPath ?? '') === (target.projectPath ?? '')
    if (sameScope && sameProject) removed.push(e)
    else remaining.push(e)
  }
  if (removed.length === 0) return { ok: false, error: 'Matching scope not found' }
  if (remaining.length > 0) file.plugins[key] = remaining
  else delete file.plugins[key]
  await writeInstalled(file)
  // If no other entries reference the cache dir, remove it.
  for (const e of removed) {
    const stillReferenced = Object.values(file.plugins).some((list) =>
      list.some((x) => x.installPath === e.installPath)
    )
    if (!stillReferenced && e.installPath) {
      try {
        await rm(e.installPath, { recursive: true, force: true })
      } catch {
        // best effort
      }
    }
  }
  return { ok: true }
}

// Future: install from marketplace plugin entry. Stubbed for now — install
// flows require resolving git-subdir / url / local sources, then writing the
// installed_plugins.json entry. Surface the catalog metadata so the UI can
// at least show what's available; mark as not implemented.
export async function installFromMarketplace(): Promise<{ ok: boolean; error: string }> {
  return { ok: false, error: 'Install from folk not yet supported. Use Claude Code CLI to install.' }
}

// Helper exposed mostly for tests / debugging.
export async function listMarketplaceFolders(): Promise<string[]> {
  try {
    return await readdir(MARKETPLACES_DIR)
  } catch {
    return []
  }
}
