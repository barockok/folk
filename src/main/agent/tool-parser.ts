import type { AgentToolCall } from './types'

const TOOL_CALL_RE = /<\|tool_call>call:(\w+)\{(.*?)\}<tool_call\|>/gs
const PARAM_RE = /(\w+):(?:<\|"\|>(.*?)<\|"\|>|([^,}]*))/g

function castValue(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  const asInt = parseInt(trimmed, 10)
  if (String(asInt) === trimmed) return asInt
  const asFloat = parseFloat(trimmed)
  if (!isNaN(asFloat) && String(asFloat) === trimmed) return asFloat
  return trimmed
}

export function parseToolCalls(text: string): AgentToolCall[] {
  const calls: AgentToolCall[] = []
  for (const match of text.matchAll(TOOL_CALL_RE)) {
    const name = match[1]
    const argsStr = match[2]
    const args: Record<string, unknown> = {}
    for (const paramMatch of argsStr.matchAll(PARAM_RE)) {
      const key = paramMatch[1]
      const stringValue = paramMatch[2]
      const rawValue = paramMatch[3]
      args[key] = stringValue !== undefined ? stringValue : castValue(rawValue)
    }
    calls.push({ name, arguments: args })
  }
  return calls
}

export function hasToolCalls(text: string): boolean {
  return text.includes('<|tool_call>')
}

export function extractThinking(text: string): { thinking: string; rest: string } {
  const thinkMatch = text.match(/<\|channel>thought\n([\s\S]*?)<channel\|>/)
  if (!thinkMatch) return { thinking: '', rest: text }
  return { thinking: thinkMatch[1].trim(), rest: text.replace(thinkMatch[0], '').trim() }
}

export function extractFinalResponse(text: string): string {
  let cleaned = text.replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '')
  cleaned = cleaned.replace(/<\|tool_call>[\s\S]*?<tool_call\|>/g, '')
  cleaned = cleaned.replace(/<\|tool_response>[\s\S]*?<tool_response\|>/g, '')
  cleaned = cleaned.replace(/<\|turn>model\s*/g, '')
  cleaned = cleaned.replace(/<turn\|>/g, '')
  cleaned = cleaned.replace(/<eos>/g, '')
  cleaned = cleaned.replace(/<end_of_turn>/g, '')
  cleaned = cleaned.replace(/<bos>/g, '')
  return cleaned.trim()
}
