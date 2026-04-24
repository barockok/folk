// Test-only stub for Electron's safeStorage API. Aliased from vitest.config.ts.
// Do not import from production code — the electron-vite build does not include this file.

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) =>
    Buffer.from('enc:' + Buffer.from(s, 'utf8').toString('base64'), 'utf8'),
  decryptString: (b: Buffer) => {
    const str = b.toString('utf8')
    if (!str.startsWith('enc:')) throw new Error('bad cipher')
    return Buffer.from(str.slice(4), 'base64').toString('utf8')
  }
}
