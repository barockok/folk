export function ToolCard({
  call
}: {
  call: { callId: string; tool: string; input: unknown; output?: unknown; isError?: boolean }
}) {
  return (
    <div className={`tool-card ${call.isError ? 'tool-err' : ''}`}>
      <strong>{call.tool}</strong>
    </div>
  )
}
