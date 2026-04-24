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
