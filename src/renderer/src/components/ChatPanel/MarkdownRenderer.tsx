import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock from './CodeBlock'

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps): React.JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          if (match) {
            return (
              <CodeBlock language={match[1]}>
                {String(children).replace(/\n$/, '')}
              </CodeBlock>
            )
          }
          return (
            <code
              className="bg-cyan-glow-12 text-electric-cyan rounded-sharp px-1.5 py-0.5 font-mono text-[13px]"
              {...props}
            >
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        },
        ul({ children }) {
          return <ul className="mb-3 last:mb-0 list-disc pl-5 space-y-1">{children}</ul>
        },
        ol({ children }) {
          return <ol className="mb-3 last:mb-0 list-decimal pl-5 space-y-1">{children}</ol>
        },
        h1({ children }) {
          return <h1 className="text-xl font-semibold text-text-primary mb-3 mt-4">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-lg font-semibold text-text-primary mb-2 mt-3">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-base font-semibold text-text-primary mb-2 mt-3">{children}</h3>
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              className="text-signal-blue hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          )
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-border-mist-12 pl-3 my-3 text-text-tertiary italic">
              {children}
            </blockquote>
          )
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="w-full border-collapse border border-border-mist-10 text-sm">
                {children}
              </table>
            </div>
          )
        },
        th({ children }) {
          return (
            <th className="border border-border-mist-10 px-3 py-1.5 text-left text-text-primary font-medium bg-surface-elevated">
              {children}
            </th>
          )
        },
        td({ children }) {
          return (
            <td className="border border-border-mist-10 px-3 py-1.5 text-text-secondary">
              {children}
            </td>
          )
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
