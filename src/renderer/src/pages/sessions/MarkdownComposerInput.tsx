import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'

// Subset of textarea-like API so the existing Composer keeps its handlers.
// Renders inline markdown for bold/italic/lists; everything else stays plain
// text. Output is markdown; outer Composer treats `value` as a string.
export interface MarkdownComposerInputHandle {
  focus: () => void
  blur: () => void
  // Reset CSS height; kept for parity with prior textarea autosize calls.
  // No-op here — ProseMirror grows with content naturally.
  resetHeight: () => void
  getEditor: () => Editor | null
}

interface Props {
  value: string
  onChange: (markdown: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  onPaste?: (e: React.ClipboardEvent) => void
  placeholder?: string
  disabled?: boolean
}

export const MarkdownComposerInput = forwardRef<MarkdownComposerInputHandle, Props>(
  function MarkdownComposerInput(
    { value, onChange, onKeyDown, onPaste, placeholder, disabled },
    ref
  ) {
    const wrapRef = useRef<HTMLDivElement>(null)
    const lastEmittedRef = useRef<string>(value)

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
          strike: false,
          code: false
        }),
        Markdown.configure({
          html: false,
          linkify: false,
          breaks: true,
          tightLists: true,
          bulletListMarker: '-'
        }),
        Placeholder.configure({
          placeholder: placeholder ?? ''
        })
      ],
      content: value,
      editable: !disabled,
      onUpdate: ({ editor }) => {
        // tiptap-markdown's editor.storage.markdown.getMarkdown()
        const md = editor.storage.markdown.getMarkdown() as string
        lastEmittedRef.current = md
        onChange(md)
      },
      editorProps: {
        attributes: {
          class: 'composer-prosemirror',
          'data-placeholder': placeholder ?? ''
        }
      }
    })

    // External value changes (slash pick, clear-on-send, history nav) → push
    // into editor. Skip if it matches what we just emitted to avoid loops.
    useEffect(() => {
      if (!editor) return
      if (value === lastEmittedRef.current) return
      lastEmittedRef.current = value
      editor.commands.setContent(value, { emitUpdate: false })
    }, [value, editor])

    useEffect(() => {
      if (!editor) return
      editor.setEditable(!disabled)
    }, [disabled, editor])

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus(),
        blur: () => editor?.commands.blur(),
        resetHeight: () => {
          if (wrapRef.current) wrapRef.current.style.height = 'auto'
        },
        getEditor: () => editor ?? null
      }),
      [editor]
    )

    return (
      <div
        ref={wrapRef}
        className={`composer-md-wrap${disabled ? ' is-disabled' : ''}`}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        data-placeholder={placeholder ?? ''}
      >
        <EditorContent editor={editor} />
      </div>
    )
  }
)
