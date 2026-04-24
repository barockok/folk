import { useState } from 'react'
import { MCPList } from './mcp/MCPList'
import { MCPConfigDrawer } from './mcp/MCPConfigDrawer'

export function MCPPage() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  return (
    <div className="page-mcp">
      <MCPList onOpen={setOpenId} onNew={() => setCreating(true)} />
      {(openId || creating) && (
        <MCPConfigDrawer
          id={openId}
          isNew={creating}
          onClose={() => {
            setOpenId(null)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}
