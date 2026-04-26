import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { ToastContainer } from './ToastContainer'
import { useUIStore } from '../stores/useUIStore'

export function Shell({ children }: { children: ReactNode }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const page = useUIStore((s) => s.page)

  return (
    <>
      <div className={`shell${collapsed ? ' sb-closed' : ''}`}>
        <Topbar />
        <Sidebar />
        <main className={`main-body${page === 'sessions' ? ' no-scroll' : ''}`}>{children}</main>
      </div>
      <CommandPalette />
      <ToastContainer />
    </>
  )
}
