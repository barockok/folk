import { useState } from 'react'
import { MCPList } from './mcp/MCPList'
import { MCPDetail } from './mcp/MCPDetail'

type View = { kind: 'list' } | { kind: 'detail'; id: string } | { kind: 'new' }

export function MCPPage() {
  const [view, setView] = useState<View>({ kind: 'list' })

  if (view.kind === 'list') {
    return (
      <MCPList
        onOpen={(id) => setView({ kind: 'detail', id })}
        onNew={() => setView({ kind: 'new' })}
      />
    )
  }

  return (
    <MCPDetail
      id={view.kind === 'detail' ? view.id : null}
      isNew={view.kind === 'new'}
      onBack={() => setView({ kind: 'list' })}
    />
  )
}
