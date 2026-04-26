import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..')

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  userDataDir: string
  cleanup: () => Promise<void>
}

export async function launchFolk(): Promise<LaunchedApp> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'folk-smoke-'))

  const app = await electron.launch({
    args: [join(ROOT, 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      FOLK_E2E: '1',
    },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // Skip first-run onboarding by priming localStorage, then reload so App.tsx
  // re-reads the flag before mounting <FirstRunOnboarding/>.
  await page.evaluate(() => {
    try {
      localStorage.setItem('folk.onboarded', '1')
    } catch {
      // origin may not allow storage on first paint — ignore
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 15_000 })

  const cleanup = async () => {
    await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
  }

  return { app, page, userDataDir, cleanup }
}
