// Map a path to an icon name (from components/icons.tsx) and a CSS color
// hint. Used by the right-rail Files list and the FileViewer header so a
// markdown file looks different from a binary blob at a glance.

export interface FileIconHint {
  name: string
  color: string
}

const DEFAULT: FileIconHint = { name: 'doc', color: 'var(--fg-faint)' }

export function fileIconFor(path: string): FileIconHint {
  const ext = (() => {
    const idx = path.lastIndexOf('.')
    return idx >= 0 ? path.slice(idx).toLowerCase() : ''
  })()

  // Web / markup
  if (ext === '.html' || ext === '.htm') return { name: 'globe', color: '#e36b3b' }
  if (ext === '.md' || ext === '.markdown' || ext === '.mdx') return { name: 'doc', color: '#3a8eff' }
  if (ext === '.svg') return { name: 'image', color: '#ffb84d' }
  if (ext === '.css' || ext === '.scss' || ext === '.sass') return { name: 'code', color: '#3a8eff' }

  // Code
  if (
    ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs' ||
    ext === '.ts' || ext === '.tsx' ||
    ext === '.py' || ext === '.rb' || ext === '.go' || ext === '.rs' ||
    ext === '.java' || ext === '.kt' || ext === '.swift' ||
    ext === '.c' || ext === '.cc' || ext === '.cpp' || ext === '.h' || ext === '.hpp' ||
    ext === '.cs' || ext === '.php' || ext === '.lua' || ext === '.dart' ||
    ext === '.sh' || ext === '.zsh' || ext === '.bash' || ext === '.fish'
  ) {
    return { name: 'code', color: 'var(--stripe-purple)' }
  }

  // Data
  if (ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.toml' || ext === '.xml' || ext === '.ini' || ext === '.env') {
    return { name: 'code', color: '#5cb85c' }
  }
  if (ext === '.csv' || ext === '.tsv' || ext === '.xlsx' || ext === '.xls') {
    return { name: 'table', color: '#1f8f4a' }
  }
  if (ext === '.sql' || ext === '.db' || ext === '.sqlite') {
    return { name: 'database', color: '#3a8eff' }
  }

  // Media
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.gif' || ext === '.webp' || ext === '.bmp' || ext === '.ico' || ext === '.avif') {
    return { name: 'image', color: '#ff5fa8' }
  }
  if (ext === '.mp4' || ext === '.webm' || ext === '.mov' || ext === '.m4v') {
    return { name: 'play', color: '#c43aff' }
  }
  if (ext === '.mp3' || ext === '.wav' || ext === '.ogg' || ext === '.m4a' || ext === '.flac') {
    return { name: 'music', color: '#3aa3ff' }
  }

  // Documents
  if (ext === '.pdf') return { name: 'doc', color: '#ea2261' }
  if (ext === '.txt' || ext === '.log') return { name: 'doc', color: 'var(--fg-faint)' }

  // Archives
  if (ext === '.zip' || ext === '.tar' || ext === '.gz' || ext === '.bz2' || ext === '.7z' || ext === '.rar') {
    return { name: 'archive', color: '#9b7cff' }
  }

  return DEFAULT
}
