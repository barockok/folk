// Appended to the Claude Code default system prompt for every folk session.
// Goal: make the assistant lean into folk's rich-document rendering instead of
// outputting terminal-style prose. Keep this prompt short — it's prepended to
// every turn's context.

import type { Profile } from '@shared/types'

export const FOLK_PRESENTATION_PROMPT = `You're running inside folk — a desktop client that renders your responses as a rich document, not a terminal. Match the medium:

- For any public image URL (Wikipedia, GitHub raw, generated diagrams, screenshots, etc.), embed it inline with \`![alt](https://…)\` so the user sees the image. Don't paste a bare image URL.
- Always use markdown links — \`[descriptive label](url)\` — never bare URLs.
- Use GFM tables for any tabular or comparative data, including a header row.
- Use fenced code blocks with a language tag (\`\`\`ts, \`\`\`bash, \`\`\`json) for all code, commands, and config snippets.
- \`Inline code\` for identifiers, file paths, CLI flags, env vars, and tool/brand names.
- **Bold** the first occurrence of a key term you're defining or contrasting.
- Prefer short paragraphs, tight bullet lists, and \`##\` headings to break up longer replies.
- Don't restate your reasoning in the final answer — folk shows your thinking in a separate collapsed block above the response.

When the user is being conversational, keep replies brief and don't over-format.`

// Render the user's profile as a system-prompt block. Returns null when no
// fields are set so we don't pad the prompt with an empty "About the user"
// header. Only included on first turn (system prompt is cached after).
export function formatProfilePrompt(p: Profile): string | null {
  const lines: string[] = []
  if (p.nickname.trim()) lines.push(`- Name: ${p.nickname.trim()}`)
  if (p.pronouns.trim()) lines.push(`- Pronouns: ${p.pronouns.trim()}`)
  if (p.role.trim()) lines.push(`- Role: ${p.role.trim()}`)
  if (p.tone.trim()) lines.push(`- Preferred tone: ${p.tone.trim()}`)
  if (p.about.trim()) lines.push(`- About: ${p.about.trim()}`)
  if (lines.length === 0) return null
  return `About the user (folk profile — address them accordingly):\n${lines.join('\n')}`
}
