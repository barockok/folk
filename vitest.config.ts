import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false
  },
  resolve: {
    alias: [
      { find: '@shared', replacement: resolve('src/shared') },
      { find: /^electron$/, replacement: resolve('src/main/__mocks__/electron.ts') },
      {
        find: /^@anthropic-ai\/claude-agent-sdk$/,
        replacement: resolve('src/main/__mocks__/claude-agent-sdk.ts')
      }
    ]
  }
})
