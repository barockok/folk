import type { Session } from '@shared/types'
import type { PageKey } from './stores/useUIStore'

export type SlashKind =
  | 'navigate' // jump to a folk page
  | 'action' // run a renderer-side action (new session, export, etc.)
  | 'prompt' // expand into a user prompt and send to the agent

export interface SlashContext {
  session: Session | null
  setPage: (p: PageKey) => void
  newSession: () => Promise<void>
  exportTranscript: () => Promise<void>
  toast: (kind: 'info' | 'ok' | 'warn' | 'err', text: string) => void
  openModelPopover: () => void
  send: (text: string) => void
  cancel: () => void
  showCost: () => void
  showStatus: () => void
}

export interface SlashCommand {
  name: string
  description: string
  kind: SlashKind
  // Aliases users might type (e.g., /resume is an alias of /sessions for navigation)
  aliases?: string[]
  // For prompt commands, the literal text pushed to the agent.
  promptText?: string
  // For action / navigate commands.
  run?: (ctx: SlashContext) => void | Promise<void>
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Navigation
  {
    name: 'mcp',
    description: 'Manage MCP servers',
    kind: 'navigate',
    run: (c) => c.setPage('mcp')
  },
  {
    name: 'model',
    description: 'Switch model for this session',
    kind: 'navigate',
    run: (c) => c.openModelPopover()
  },
  {
    name: 'sessions',
    description: 'Show sessions list',
    kind: 'navigate',
    aliases: ['resume'],
    run: (c) => c.setPage('sessions')
  },
  {
    name: 'config',
    description: 'Open settings',
    kind: 'navigate',
    run: (c) => c.setPage('profile')
  },
  {
    name: 'keybindings',
    description: 'Edit keyboard shortcuts',
    kind: 'navigate',
    run: (c) => c.setPage('keybindings')
  },
  {
    name: 'skills',
    description: 'Browse skills',
    kind: 'navigate',
    run: (c) => c.setPage('skills')
  },
  {
    name: 'plugins',
    description: 'Browse plugins',
    kind: 'navigate',
    run: (c) => c.setPage('plugins')
  },
  {
    name: 'agents',
    description: 'Browse subagents (alias for skills)',
    kind: 'navigate',
    run: (c) => c.setPage('skills')
  },

  // Renderer actions
  {
    name: 'clear',
    description: 'Start a new session in the same folder',
    kind: 'action',
    run: (c) => c.newSession()
  },
  {
    name: 'export',
    description: 'Export this transcript to markdown',
    kind: 'action',
    run: (c) => c.exportTranscript()
  },
  {
    name: 'cancel',
    description: 'Cancel the current turn',
    kind: 'action',
    run: (c) => c.cancel()
  },

  // Prompt-shaped passthroughs the SDK / model already understand
  {
    name: 'compact',
    description: 'Manually compact context now',
    kind: 'prompt',
    promptText: '/compact'
  },
  {
    name: 'init',
    description: 'Generate or update CLAUDE.md',
    kind: 'prompt',
    promptText:
      'Please run /init: read the project, then create or update a CLAUDE.md at the repository root with concise, factual guidance for future agents.'
  },
  {
    name: 'review',
    description: 'Review the current PR / branch',
    kind: 'prompt',
    promptText:
      'Please review the current branch like /review: list the diff vs main, flag bugs, regressions, and missing tests, and suggest fixes.'
  },
  {
    name: 'security-review',
    description: 'Security review of pending changes',
    kind: 'prompt',
    promptText:
      'Please do a security review of the pending changes: look for OWASP-style issues (injection, XSS, SSRF, auth, secret leakage), unsafe defaults, and missing validation. Cite file:line.'
  },
  {
    name: 'pr-comments',
    description: 'Fetch and summarize PR comments',
    kind: 'prompt',
    promptText:
      'Please fetch comments on the current PR (gh pr view --json comments,reviews) and summarize unresolved ones with file:line references.'
  },
  {
    name: 'memory',
    description: 'Open CLAUDE.md memory file (project)',
    kind: 'prompt',
    promptText:
      'Open the project CLAUDE.md for editing. If it does not exist, create one with a short skeleton.'
  },
  {
    name: 'status',
    description: 'Show session status snapshot',
    kind: 'action',
    run: (c) => c.showStatus()
  },
  {
    name: 'cost',
    description: 'Show token usage and cost so far',
    kind: 'action',
    run: (c) => c.showCost()
  }
]

export function findCommand(input: string): SlashCommand | null {
  const name = input.replace(/^\//, '').split(/\s+/)[0]?.toLowerCase()
  if (!name) return null
  for (const cmd of SLASH_COMMANDS) {
    if (cmd.name === name) return cmd
    if (cmd.aliases?.includes(name)) return cmd
  }
  return null
}

export function filterCommands(query: string): SlashCommand[] {
  const q = query.replace(/^\//, '').toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) =>
      c.name.startsWith(q) ||
      c.aliases?.some((a) => a.startsWith(q)) ||
      c.description.toLowerCase().includes(q)
  )
}
