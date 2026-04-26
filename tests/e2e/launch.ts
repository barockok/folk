import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')

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

  // Surface main-process logs so a window-never-appears failure is debuggable.
  app.process().stdout?.on('data', (b) => process.stdout.write(`[folk-main] ${b}`))
  app.process().stderr?.on('data', (b) => process.stderr.write(`[folk-main] ${b}`))

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

  // Seed a fake Anthropic provider with an enabled model. SessionSetup needs at
  // least one enabled model to render its grouped picker; the Models page
  // needs a provider row to render the Test button. The fake key never gets
  // exercised because the smoke spec doesn't send any real turns.
  await page.evaluate(async () => {
    const folk = (window as unknown as { folk?: { providers?: { save?: (p: unknown) => Promise<unknown> } } }).folk
    if (!folk?.providers?.save) return
    await folk.providers.save({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: 'sk-ant-FAKE-FOR-SMOKE-TEST',
      authMode: 'api-key',
      baseUrl: null,
      models: [
        { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', enabled: true },
        { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', enabled: true },
      ],
      isEnabled: true,
      createdAt: Date.now(),
    })
  })
  // Trigger the providers store to re-hydrate post-seed.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 15_000 })

  const cleanup = async () => {
    await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
  }

  return { app, page, userDataDir, cleanup }
}
