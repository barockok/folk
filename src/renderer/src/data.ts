// data.ts — seed data for MCPs, skills, plugins, marketplace

// Local UI-only types (not stored in backend DB)

export interface UIMCPEnvVar {
  key: string
  value: string
  secret?: boolean
}

export interface UIMCPSeed {
  id: string
  name: string
  desc: string
  icon: string
  kind: string
  status: 'connected' | 'error' | 'idle'
  tools: number
  scope: 'user' | 'project'
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  env: UIMCPEnvVar[]
  enabled: boolean
  lastUsed: string
  error?: string
}

export interface UISkill {
  id: string
  name: string
  desc: string
  trigger: string
  enabled: boolean
  author: string
}

export interface UIPlugin {
  id: string
  name: string
  desc: string
  ver: string
  status: 'enabled' | 'disabled' | 'update'
  author: string
}

export interface UIMarketItem {
  id: string
  kind: 'mcp' | 'skill' | 'plugin'
  name: string
  author: string
  desc: string
  downloads: string
  rating: number
  tag: string
  icon: string
  cats: string[]
  featured?: boolean
}

export interface UIKeybinding {
  action: string
  keys: string[]
  scope: string
}

export const INITIAL_MCPS: UIMCPSeed[] = [
  { id: 'fs', name: 'Filesystem', desc: 'Read and write files on your Mac', icon: 'FS', kind: 'Local command', status: 'connected', tools: 8, scope: 'user', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '~/Documents', '~/Projects'], env: [], enabled: true, lastUsed: '2m ago' },
  { id: 'gh', name: 'GitHub', desc: 'Issues, pull requests, repositories', icon: 'GH', kind: 'Local command', status: 'connected', tools: 24, scope: 'user', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: [{ key: 'GITHUB_TOKEN', value: 'ghp_••••••••••••••••aR4X', secret: true }], enabled: true, lastUsed: '14m ago' },
  { id: 'pg', name: 'Postgres (analytics)', desc: 'Query your production analytics database', icon: 'PG', kind: 'Local command', status: 'error', tools: 0, scope: 'project', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', 'postgres://analytics:••••@db.internal/prod'], env: [], enabled: true, lastUsed: 'yesterday', error: 'Connection refused: could not reach db.internal on port 5432' },
  { id: 'slack', name: 'Slack', desc: 'Read channels, post messages, search history', icon: 'SL', kind: 'Remote (HTTP)', status: 'connected', tools: 12, scope: 'user', transport: 'http', url: 'https://mcp.slack.com/v1', env: [{ key: 'SLACK_BOT_TOKEN', value: 'xoxb-••••-••••-••••', secret: true }], enabled: true, lastUsed: 'just now' },
  { id: 'linear', name: 'Linear', desc: 'Tickets, cycles, projects', icon: 'LN', kind: 'Remote (HTTP)', status: 'idle', tools: 16, scope: 'user', transport: 'http', url: 'https://mcp.linear.app/sse', env: [{ key: 'LINEAR_API_KEY', value: 'lin_api_••••••••', secret: true }], enabled: false, lastUsed: '3 days ago' },
  { id: 'puppeteer', name: 'Puppeteer', desc: 'Browse and interact with web pages', icon: 'PP', kind: 'Local command', status: 'connected', tools: 6, scope: 'user', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'], env: [], enabled: true, lastUsed: '1h ago' },
  { id: 'memory', name: 'Memory', desc: 'Persistent knowledge graph across sessions', icon: 'MM', kind: 'Local command', status: 'connected', tools: 9, scope: 'user', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], env: [], enabled: true, lastUsed: '22m ago' },
]

export const INITIAL_SKILLS: UISkill[] = [
  { id: 's1', name: 'Write release notes', desc: 'Summarize git commits into warm, readable release notes', trigger: 'release, changelog, notes', enabled: true, author: 'you' },
  { id: 's2', name: 'Review PR for security', desc: 'Scan a diff for common security mistakes', trigger: 'security review, audit pr', enabled: true, author: 'anthropic' },
  { id: 's3', name: 'Draft email reply', desc: 'Reply to an email in my voice — concise, warm', trigger: 'reply, draft email', enabled: true, author: 'you' },
  { id: 's4', name: 'Plan a trip', desc: 'Build a multi-day itinerary from constraints', trigger: 'trip, itinerary, travel', enabled: false, author: 'community' },
  { id: 's5', name: 'Summarize meeting', desc: 'Turn a transcript into TL;DR + action items', trigger: 'meeting, transcript, summary', enabled: true, author: 'you' },
  { id: 's6', name: "Explain like I'm five", desc: 'Rewrite technical docs for non-technical readers', trigger: 'eli5, simplify, explain', enabled: false, author: 'community' },
]

export const INITIAL_PLUGINS: UIPlugin[] = [
  { id: 'p1', name: 'Vercel deploys', desc: 'Trigger and monitor production deploys', ver: '1.4.2', status: 'enabled', author: 'vercel' },
  { id: 'p2', name: 'Figma bridge', desc: 'Pull frames and tokens from Figma files', ver: '0.8.1', status: 'enabled', author: 'community' },
  { id: 'p3', name: 'Obsidian vault', desc: 'Read & write your notes vault', ver: '2.1.0', status: 'disabled', author: 'you' },
  { id: 'p4', name: 'Stripe invoicer', desc: 'Draft invoices and customer emails', ver: '0.2.3', status: 'update', author: 'community' },
]

export const MARKET_ITEMS: UIMarketItem[] = [
  // FEATURED (hero row)
  { id: 'notion', kind: 'mcp', name: 'Notion', author: 'Notion Labs', desc: 'Read pages, update databases, and search your Notion workspace.', downloads: '84.2k', rating: 4.8, tag: 'Verified', icon: 'NT', cats: ['Productivity'], featured: true },
  { id: 'brave', kind: 'mcp', name: 'Brave Search', author: 'Community', desc: 'Private, high-quality web search backed by the Brave index.', downloads: '127k', rating: 4.9, tag: 'Popular', icon: 'BR', cats: ['Search', 'Web'], featured: true },
  { id: 'pr-review', kind: 'skill', name: 'PR Review Assistant', author: 'anthropic', desc: 'Walk through a pull request, flag risks, suggest improvements.', downloads: '22.1k', rating: 4.7, tag: 'Verified', icon: 'PR', cats: ['Dev', 'Code'], featured: true },
  { id: 'vercel', kind: 'plugin', name: 'Vercel Deploys', author: 'vercel', desc: 'Trigger and monitor production deploys from any session.', downloads: '15.4k', rating: 4.6, tag: 'Verified', icon: 'VE', cats: ['Dev', 'DevOps'], featured: true },

  // MCP
  { id: 'sentry', kind: 'mcp', name: 'Sentry', author: 'Sentry', desc: 'Pull error reports, stack traces, and release health into any chat.', downloads: '31.5k', rating: 4.7, tag: 'Verified', icon: 'SN', cats: ['Dev', 'Monitoring'] },
  { id: 'gmail', kind: 'mcp', name: 'Gmail', author: 'mcpkit', desc: 'Read, draft, and send mail from your Gmail account with OAuth.', downloads: '58.1k', rating: 4.6, tag: 'Trending', icon: 'GM', cats: ['Productivity', 'Email'] },
  { id: 'fig', kind: 'mcp', name: 'Figma', author: 'Community', desc: 'Extract frames, components, and design tokens from a Figma file.', downloads: '42.7k', rating: 4.5, tag: '', icon: 'FG', cats: ['Design'] },
  { id: 'gmaps', kind: 'mcp', name: 'Google Maps', author: 'Google', desc: 'Directions, geocoding, and place search for location-aware agents.', downloads: '19.3k', rating: 4.4, tag: 'Verified', icon: 'GG', cats: ['Web', 'Location'] },
  { id: 'jira', kind: 'mcp', name: 'Jira', author: 'Atlassian', desc: 'Tickets, sprints, and boards — edit them from chat.', downloads: '28.9k', rating: 4.3, tag: 'Verified', icon: 'JR', cats: ['Productivity', 'Dev'] },
  { id: 'stripe', kind: 'mcp', name: 'Stripe', author: 'Stripe', desc: 'Customers, invoices, payouts, refunds — the whole dashboard.', downloads: '17.2k', rating: 4.8, tag: 'Verified', icon: 'ST', cats: ['Business', 'Finance'] },

  // SKILLS
  { id: 'skill-rel', kind: 'skill', name: 'Release notes writer', author: 'community', desc: 'Turn a git log into warm, readable release notes for your users.', downloads: '11.8k', rating: 4.6, tag: 'Trending', icon: 'RN', cats: ['Writing', 'Dev'] },
  { id: 'skill-brief', kind: 'skill', name: 'Meeting brief', author: 'you · team', desc: 'Summarize a transcript into TL;DR, decisions, and action items.', downloads: '7.3k', rating: 4.5, tag: '', icon: 'MB', cats: ['Productivity'] },
  { id: 'skill-eli5', kind: 'skill', name: "Explain like I'm five", author: 'community', desc: 'Rewrite any technical doc for a non-technical reader.', downloads: '19.0k', rating: 4.4, tag: 'Popular', icon: 'E5', cats: ['Writing'] },
  { id: 'skill-sql', kind: 'skill', name: 'SQL tutor', author: 'community', desc: 'Teaches SQL interactively using your own Postgres schema.', downloads: '4.2k', rating: 4.3, tag: '', icon: 'SQ', cats: ['Dev', 'Data'] },
  { id: 'skill-sec', kind: 'skill', name: 'Security reviewer', author: 'anthropic', desc: 'Scan a diff for common OWASP mistakes before you ship.', downloads: '9.6k', rating: 4.7, tag: 'Verified', icon: 'SC', cats: ['Dev', 'Security'] },

  // PLUGINS
  { id: 'plugin-obsidian', kind: 'plugin', name: 'Obsidian Vault', author: 'community', desc: 'Read and write your Obsidian notes vault directly.', downloads: '6.1k', rating: 4.5, tag: '', icon: 'OB', cats: ['Productivity', 'Notes'] },
  { id: 'plugin-linear', kind: 'plugin', name: 'Linear Command', author: 'community', desc: 'Quick-create tickets from chat; triage the inbox with /linear.', downloads: '8.9k', rating: 4.6, tag: 'Trending', icon: 'LN', cats: ['Dev', 'Productivity'] },
  { id: 'plugin-invoice', kind: 'plugin', name: 'Stripe Invoicer', author: 'community', desc: 'Draft invoices and customer emails from natural language.', downloads: '3.4k', rating: 4.2, tag: '', icon: 'IN', cats: ['Business', 'Finance'] },
  { id: 'plugin-spotify', kind: 'plugin', name: 'Spotify DJ', author: 'community', desc: 'Queue tracks, build playlists, cue stations by vibe.', downloads: '12.7k', rating: 4.1, tag: 'Popular', icon: 'SP', cats: ['Lifestyle'] },
]

export const MARKET_CATS: string[] = ['All', 'Dev', 'Productivity', 'Writing', 'Design', 'Business', 'Web', 'Data', 'Security']

export const KEYBINDINGS: UIKeybinding[] = [
  { action: 'Open command menu', keys: ['⌘', 'K'], scope: 'Global' },
  { action: 'New session', keys: ['⌘', 'N'], scope: 'Global' },
  { action: 'Switch to MCP Servers', keys: ['⌘', '1'], scope: 'Global' },
  { action: 'Switch to Skills', keys: ['⌘', '2'], scope: 'Global' },
  { action: 'Switch to Plugins', keys: ['⌘', '3'], scope: 'Global' },
  { action: 'Test connect (selected MCP)', keys: ['⌘', 'T'], scope: 'MCP' },
  { action: 'Edit selected', keys: ['⌘', 'E'], scope: 'Any list' },
  { action: 'Delete selected', keys: ['⌘', '⌫'], scope: 'Any list' },
  { action: 'Toggle enabled', keys: ['Space'], scope: 'Any list' },
  { action: 'Submit prompt', keys: ['↵'], scope: 'Terminal' },
  { action: 'Newline in prompt', keys: ['⇧', '↵'], scope: 'Terminal' },
  { action: 'Cycle model', keys: ['⌘', 'M'], scope: 'Terminal' },
  { action: 'Toggle theme', keys: ['⌘', '⇧', 'L'], scope: 'Global' },
]
