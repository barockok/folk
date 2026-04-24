import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useUIStore } from '../stores/useUIStore'

export function Shell({ children }: { children: ReactNode }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const page = useUIStore((s) => s.page)

  return (
    <div className={`shell${collapsed ? ' sb-closed' : ''}`}>
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className={`main-body${page === 'sessions' ? ' no-scroll' : ''}`}>{children}</main>
      </div>
    </div>
  )
}
