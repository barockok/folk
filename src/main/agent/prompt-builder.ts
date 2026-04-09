import type { ToolDefinition, AgentToolResponse, ConversationMessage } from './types'

function formatToolDeclaration(tool: ToolDefinition): string {
  const schema: Record<string, unknown> = { description: tool.description }
  if (tool.parameters) schema.parameters = tool.parameters
  return `<|tool>declaration:${tool.name}${JSON.stringify(schema)}<tool|>`
}

function formatToolResponse(response: AgentToolResponse): string {
  const entries = Object.entries(response.result)
    .map(([k, v]) => {
      if (typeof v === 'string') return `${k}:<|"|>${v}<|"|>`
      return `${k}:${JSON.stringify(v)}`
    })
    .join(',')
  return `response:${response.name}{${entries}}<tool_response|>`
}

export function buildPrompt(
  systemPrompt: string,
  tools: ToolDefinition[],
  history: ConversationMessage[],
  enableThinking: boolean
): string {
  const parts: string[] = []

  const thinkToken = enableThinking ? '<|think|>' : ''
  const toolDeclarations = tools.map(formatToolDeclaration).join('')
  parts.push(`<|turn>system\n${thinkToken}${systemPrompt}${toolDeclarations}<turn|>`)

  for (const msg of history) {
    if (msg.role === 'user') {
      parts.push(`<|turn>user\n${msg.content}<turn|>`)
    }
    if (msg.role === 'model') {
      if (msg.toolCalls && msg.toolResponses) {
        const callStr = msg.toolCalls
          .map((call) => {
            const args = Object.entries(call.arguments)
              .map(([k, v]) =>
                typeof v === 'string' ? `${k}:<|"|>${v}<|"|>` : `${k}:${v}`
              )
              .join(',')
            return `<|tool_call>call:${call.name}{${args}}<tool_call|>`
          })
          .join('')
        const respStr = msg.toolResponses.map(formatToolResponse).join('')
        parts.push(`<|turn>model\n${callStr}<|tool_response>${respStr}`)
        if (msg.content) parts.push(`${msg.content}<turn|>`)
      } else {
        parts.push(`<|turn>model\n${msg.content}<turn|>`)
      }
    }
  }

  parts.push('<|turn>model')
  return parts.join('\n')
}
