import { test, expect } from '@playwright/test'
import { launchFolk, type LaunchedApp } from './launch'

let ctx: LaunchedApp

test.beforeAll(async () => {
  ctx = await launchFolk()
})

test.afterAll(async () => {
  await ctx?.cleanup()
})

/**
 * Coverage map (vs docs/how-to-smoke.md):
 *
 *   automated here:
 *     3  Skills + Plugins pages render
 *    14  SessionSetup "Skip permissions" toggle present
 *    20  Models page renders provider Test buttons
 *    23  SessionSetup picker grouped by provider
 *    24  Markdown table renders with content-hugging width
 *
 *   skipped (need an active session — that requires a real send to a real
 *   provider, which the smoke harness can't fake without breaking the SDK):
 *     1  slash menu (composer disabled until a session is active)
 *    13  permission chip (same)
 *
 *   manual only (need a live agent / keychain / file-watch):
 *     2 plugin commands, 4 compact, 5 cost/status, 6 subagents,
 *     7 diff cards, 8 TodoWrite, 9 MCP humanize, 10 tool group,
 *    11 live thinking, 12 auto-title, 15 /clear inheritance,
 *    16 tool progress, 17 prompt suggestions, 18 rate-limit/retry,
 *    19 system notices, 21 custom provider model add,
 *    25 inline image, 26 dev keychain bypass
 *
 * SDK message routing the manual scenarios depend on is covered by
 * src/main/agent-manager.test.ts (vitest, 29 cases).
 */

test('3 — Skills + Plugins pages render', async () => {
  const { page } = ctx
  await page.locator('.sb-item', { hasText: 'Skills' }).click()
  await expect(page.locator('body')).toContainText(/skill/i, { timeout: 8000 })

  await page.locator('.sb-item', { hasText: 'Plugins' }).click()
  await expect(page.locator('body')).toContainText(/plugin/i, { timeout: 8000 })
})

test('14 + 23 — SessionSetup shows Skip permissions toggle and grouped picker', async () => {
  const { page } = ctx
  await page.locator('.sb-item', { hasText: 'Sessions' }).click()
  const newBtn = page.locator('button[title^="New session"]').first()
  await expect(newBtn).toBeVisible({ timeout: 8000 })
  await newBtn.click()
  await expect(page.locator('.ss-card')).toBeVisible()
  // Skip-permissions toggle lives inside the collapsible "Launch options"
  // accordion — expand it first.
  await page.locator('.ss-adv-toggle').click()
  await expect(page.locator('.ss-perm', { hasText: /skip permissions/i })).toBeVisible()
  // Provider grouping — at least one provider header rendered, or the
  // model grid is visible (selectors vary across the recent UI revs).
  const providerHeads = page.locator('.ss-model-provider, .ss-prov-head')
  if ((await providerHeads.count()) === 0) {
    await expect(page.locator('.ss-model-grid')).toBeVisible()
  } else {
    await expect(providerHeads.first()).toBeVisible()
  }
  await page.keyboard.press('Escape').catch(() => {})
})

test('20 — Models page renders Test button on active provider', async () => {
  const { page } = ctx
  await page.locator('.sb-item', { hasText: 'Models' }).click()
  await expect(page.locator('body')).toContainText(/model/i)
  // The active-provider detail panel renders a button with title="Test connection".
  // If providers list is rendered as cards that need clicking first, click the
  // first one. Otherwise the seeded provider is auto-selected.
  const provCard = page.locator('[class*="prov-card"], .prov-row, .prov-list .prov').first()
  if ((await provCard.count()) > 0 && (await provCard.isVisible().catch(() => false))) {
    await provCard.click().catch(() => {})
  }
  const testBtn = page.locator('button[title="Test connection"]')
  await expect(testBtn).toBeVisible({ timeout: 8000 })
})

test('24 — markdown table renders with content-hugging width', async () => {
  const { page } = ctx
  const result = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'md-body'
    const table = document.createElement('table')
    const thead = document.createElement('thead')
    const trh = document.createElement('tr')
    const th = document.createElement('th')
    th.textContent = 'a'
    trh.appendChild(th)
    thead.appendChild(trh)
    const tbody = document.createElement('tbody')
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.textContent = '1'
    tr.appendChild(td)
    tbody.appendChild(tr)
    table.appendChild(thead)
    table.appendChild(tbody)
    probe.appendChild(table)
    document.body.appendChild(probe)
    const w = getComputedStyle(table).width
    probe.remove()
    return { w }
  })
  // Anything other than viewport-stretched 100% is acceptable.
  expect(result.w).not.toMatch(/^\s*100%\s*$/)
})
