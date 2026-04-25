import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverCommands, discoverSkills } from './disk-discovery'

describe('disk-discovery', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'folk-disc-'))
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('discovers project skills with parsed frontmatter', async () => {
    const skillsDir = join(projectDir, '.claude', 'skills', 'demo')
    mkdirSync(skillsDir, { recursive: true })
    writeFileSync(
      join(skillsDir, 'SKILL.md'),
      `---
name: demo
description: Test skill description
---

# Body
hello
`
    )
    // Loose `<name>.md` skill alongside directory-based one.
    const looseDir = join(projectDir, '.claude', 'skills')
    writeFileSync(
      join(looseDir, 'inline.md'),
      `---
name: inline
description: Inline skill
---
body
`
    )
    const skills = await discoverSkills(projectDir)
    const project = skills.filter((s) => s.scope === 'project')
    const ids = project.map((s) => s.id)
    expect(ids).toContain('project:demo')
    expect(ids).toContain('project:inline')
    const demo = project.find((s) => s.id === 'project:demo')!
    expect(demo.name).toBe('demo')
    expect(demo.description).toBe('Test skill description')
  })

  it('discovers project commands and reads description from frontmatter', async () => {
    const cmdDir = join(projectDir, '.claude', 'commands')
    mkdirSync(cmdDir, { recursive: true })
    writeFileSync(
      join(cmdDir, 'ship.md'),
      `---
description: Cuts a release
---

Body content here.
`
    )
    writeFileSync(join(cmdDir, 'no-fm.md'), 'just a body, no frontmatter')
    const cmds = await discoverCommands(projectDir)
    const project = cmds.filter((c) => c.scope === 'project')
    expect(project.find((c) => c.name === 'ship')?.description).toBe('Cuts a release')
    expect(project.find((c) => c.name === 'no-fm')?.description).toBe('')
  })

  it('returns empty arrays for non-existent dirs', async () => {
    const cmds = await discoverCommands(join(projectDir, 'no-exist'))
    expect(Array.isArray(cmds)).toBe(true)
  })
})
