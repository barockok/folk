import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type {
  DiscoveredCommand,
  DiscoveredPlugin,
  DiscoveredSkill
} from '@shared/types'

// Lightweight YAML frontmatter extractor — handles `---` delimited blocks at
// the very start of a markdown file. Only pulls out flat scalar fields (no
// nested objects or lists) which is all the SKILL.md / commands spec uses.
function parseFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith('---')) return {}
  const end = text.indexOf('\n---', 3)
  if (end === -1) return {}
  const block = text.slice(3, end).replace(/^\r?\n/, '')
  const out: Record<string, string> = {}
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

async function safeStat(p: string): Promise<{ isDirectory(): boolean; isFile(): boolean } | null> {
  try {
    return await stat(p)
  } catch {
    return null
  }
}

async function readSkillEntry(
  parent: string,
  entryName: string,
  scope: 'user' | 'project'
): Promise<DiscoveredSkill | null> {
  const full = join(parent, entryName)
  const st = await safeStat(full)
  if (!st) return null
  let mdPath: string | null = null
  let id = entryName
  if (st.isDirectory()) {
    const skillFile = join(full, 'SKILL.md')
    if (await safeStat(skillFile)) mdPath = skillFile
  } else if (st.isFile() && entryName.endsWith('.md')) {
    mdPath = full
    id = entryName.replace(/\.md$/, '')
  }
  if (!mdPath) return null
  let raw: string
  try {
    raw = await readFile(mdPath, 'utf8')
  } catch {
    return null
  }
  const fm = parseFrontmatter(raw)
  return {
    id: `${scope}:${id}`,
    name: fm.name || id,
    description: fm.description || '',
    scope,
    path: mdPath
  }
}

async function listDir(p: string): Promise<string[]> {
  try {
    return await readdir(p)
  } catch {
    return []
  }
}

export async function discoverSkills(workingDir: string | null): Promise<DiscoveredSkill[]> {
  const out: DiscoveredSkill[] = []
  const userDir = join(homedir(), '.claude', 'skills')
  for (const entry of await listDir(userDir)) {
    const skill = await readSkillEntry(userDir, entry, 'user')
    if (skill) out.push(skill)
  }
  if (workingDir) {
    const projDir = join(workingDir, '.claude', 'skills')
    for (const entry of await listDir(projDir)) {
      const skill = await readSkillEntry(projDir, entry, 'project')
      if (skill) out.push(skill)
    }
  }
  return out
}

async function readCommandFile(
  parent: string,
  entryName: string,
  scope: DiscoveredCommand['scope']
): Promise<DiscoveredCommand | null> {
  if (!entryName.endsWith('.md')) return null
  const full = join(parent, entryName)
  const st = await safeStat(full)
  if (!st || !st.isFile()) return null
  let raw: string
  try {
    raw = await readFile(full, 'utf8')
  } catch {
    return null
  }
  const fm = parseFrontmatter(raw)
  const name = entryName.replace(/\.md$/, '')
  return {
    name,
    description: fm.description || fm.summary || '',
    scope,
    path: full
  }
}

export async function discoverCommands(
  workingDir: string | null
): Promise<DiscoveredCommand[]> {
  const out: DiscoveredCommand[] = []
  const userDir = join(homedir(), '.claude', 'commands')
  for (const entry of await listDir(userDir)) {
    const cmd = await readCommandFile(userDir, entry, 'user')
    if (cmd) out.push(cmd)
  }
  if (workingDir) {
    const projDir = join(workingDir, '.claude', 'commands')
    for (const entry of await listDir(projDir)) {
      const cmd = await readCommandFile(projDir, entry, 'project')
      if (cmd) out.push(cmd)
    }
  }
  // Plugin-bundled commands: each installed plugin may ship `commands/*.md`.
  const plugins = await discoverPlugins()
  for (const p of plugins) {
    const cmdDir = join(p.installPath, 'commands')
    for (const entry of await listDir(cmdDir)) {
      const cmd = await readCommandFile(cmdDir, entry, 'plugin')
      if (cmd) {
        cmd.plugin = p.name
        // Namespace plugin commands so two plugins can ship same-named commands.
        cmd.name = `${p.name}:${cmd.name}`
        out.push(cmd)
      }
    }
  }
  return out
}

interface InstalledPluginRaw {
  scope: 'user' | 'project'
  projectPath?: string
  installPath: string
  version?: string
  installedAt?: string
  lastUpdated?: string
}

interface InstalledPluginsManifest {
  version: number
  plugins: Record<string, InstalledPluginRaw[]>
}

export async function discoverPlugins(): Promise<DiscoveredPlugin[]> {
  const manifestPath = join(homedir(), '.claude', 'plugins', 'installed_plugins.json')
  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf8')
  } catch {
    return []
  }
  let parsed: InstalledPluginsManifest
  try {
    parsed = JSON.parse(raw) as InstalledPluginsManifest
  } catch {
    return []
  }
  const out: DiscoveredPlugin[] = []
  for (const [key, entries] of Object.entries(parsed.plugins ?? {})) {
    const [name, marketplace = ''] = key.split('@')
    for (const entry of entries) {
      // Try to read a description from the plugin's manifest if present.
      let description = ''
      const candidates = ['plugin.json', 'manifest.json', 'package.json']
      for (const c of candidates) {
        try {
          const text = await readFile(join(entry.installPath, c), 'utf8')
          const obj = JSON.parse(text) as { description?: string }
          if (obj.description) {
            description = obj.description
            break
          }
        } catch {
          // ignore — no manifest is fine
        }
      }
      out.push({
        id: `${name}@${marketplace}#${entry.scope}${entry.projectPath ?? ''}`,
        name: name ?? basename(entry.installPath),
        marketplace,
        version: entry.version ?? 'unknown',
        scope: entry.scope,
        projectPath: entry.projectPath ?? null,
        installPath: entry.installPath,
        description,
        lastUpdated: entry.lastUpdated ?? entry.installedAt ?? null
      })
    }
  }
  return out
}
