import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { ToastContainer } from './ToastContainer'
import { MCPElicitationModal } from './MCPElicitationModal'
import { UpdateBanner } from './UpdateBanner'
import { useUIStore } from '../stores/useUIStore'

export function Shell({ children }: { children: ReactNode }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const page = useUIStore((s) => s.page)
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)

  return (
    <>
      <div
        className={`shell${collapsed ? ' sb-closed' : ''}`}
        style={{ ['--sb-width' as string]: `${sidebarWidth}px` }}
      >
        <Topbar />
        <Sidebar />
        <main className={`main-body${page === 'sessions' ? ' no-scroll' : ''}`}>{children}</main>
        <UpdateBanner />
      </div>
      <CommandPalette />
      <ToastContainer />
      <MCPElicitationModal />
    </>
  )
}
