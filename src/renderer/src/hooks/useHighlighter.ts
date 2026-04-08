import { createHighlighter, type Highlighter } from 'shiki'
import { useState, useEffect } from 'react'

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: ['javascript', 'typescript', 'python', 'rust', 'go', 'java', 'c', 'cpp', 'bash', 'shell', 'json', 'yaml', 'toml', 'html', 'css', 'sql', 'markdown', 'jsx', 'tsx', 'swift', 'kotlin', 'ruby', 'php', 'text'],
    })
  }
  return highlighterPromise
}

export function useHighlighter() {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)

  useEffect(() => {
    getHighlighter().then(setHighlighter)
  }, [])

  return highlighter
}
