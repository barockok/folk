import type { ToolDefinition, AgentToolCall, AgentToolResponse } from './types'
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'fs'
import { execSync } from 'child_process'
import { join, resolve } from 'path'

export function getFolkToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file. Returns the text content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace' }
        },
        required: ['path']
      }
    },
    {
      name: 'write_file',
      description: 'Write content to a file. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'list_directory',
      description: 'List files and directories in a path.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path relative to workspace (default: .)'
          }
        }
      }
    },
    {
      name: 'run_command',
      description: 'Run a shell command and return the output.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' }
        },
        required: ['command']
      }
    },
    {
      name: 'search_files',
      description: 'Search for files matching a glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. **/*.ts)' }
        },
        required: ['pattern']
      }
    },
    {
      name: 'search_content',
      description: 'Search file contents for a text pattern (grep).',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regex pattern to search for' },
          glob: { type: 'string', description: 'File glob to limit search (default: **)' }
        },
        required: ['pattern']
      }
    }
  ]
}

function checkPath(
  callName: string,
  p: string,
  workspacePath: string
): AgentToolResponse | null {
  const resolved = p.startsWith('/') ? p : resolve(workspacePath, p)
  if (!resolved.startsWith(resolve(workspacePath))) {
    return { name: callName, result: { error: 'Path outside workspace' } }
  }
  return null
}

export function executeFolkTool(
  call: AgentToolCall,
  workspacePath: string
): AgentToolResponse {
  try {
    switch (call.name) {
      case 'read_file': {
        const p = call.arguments.path as string
        const pathErr = checkPath(call.name, p, workspacePath)
        if (pathErr) return pathErr
        const fullPath = resolve(workspacePath, p)
        if (!existsSync(fullPath))
          return { name: call.name, result: { error: `File not found: ${p}` } }
        const content = readFileSync(fullPath, 'utf-8')
        return { name: call.name, result: { content } }
      }

      case 'write_file': {
        const p = call.arguments.path as string
        const content = call.arguments.content as string
        const pathErr = checkPath(call.name, p, workspacePath)
        if (pathErr) return pathErr
        const fullPath = resolve(workspacePath, p)
        const dir = resolve(fullPath, '..')
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(fullPath, content, 'utf-8')
        return { name: call.name, result: { success: true, path: p } }
      }

      case 'list_directory': {
        const p = (call.arguments.path as string) || '.'
        const pathErr = checkPath(call.name, p, workspacePath)
        if (pathErr) return pathErr
        const fullPath = resolve(workspacePath, p)
        if (!existsSync(fullPath))
          return { name: call.name, result: { error: `Directory not found: ${p}` } }
        const entries = readdirSync(fullPath, { withFileTypes: true })
        const items = entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          size: e.isFile() ? statSync(join(fullPath, e.name)).size : undefined
        }))
        return { name: call.name, result: { entries: items } }
      }

      case 'run_command': {
        const cmd = call.arguments.command as string
        try {
          const output = execSync(cmd, {
            cwd: workspacePath,
            encoding: 'utf-8',
            timeout: 30000,
            maxBuffer: 1024 * 1024
          })
          return { name: call.name, result: { output: output.slice(0, 5000) } }
        } catch (err: unknown) {
          const execErr = err as { stderr?: string; message: string }
          return {
            name: call.name,
            result: { error: execErr.stderr?.slice(0, 2000) || execErr.message }
          }
        }
      }

      case 'search_files': {
        const pattern = call.arguments.pattern as string
        try {
          const output = execSync(
            `find . -path "${pattern.replace(/"/g, '\\"')}" -type f 2>/dev/null | head -50`,
            { cwd: workspacePath, encoding: 'utf-8', timeout: 10000 }
          )
          const files = output.trim().split('\n').filter(Boolean)
          return { name: call.name, result: { files } }
        } catch {
          return { name: call.name, result: { files: [] } }
        }
      }

      case 'search_content': {
        const pattern = call.arguments.pattern as string
        const glob = (call.arguments.glob as string) || '*'
        try {
          const output = execSync(
            `grep -rl "${pattern.replace(/"/g, '\\"')}" --include="${glob}" . 2>/dev/null | head -20`,
            { cwd: workspacePath, encoding: 'utf-8', timeout: 10000 }
          )
          const files = output.trim().split('\n').filter(Boolean)
          return { name: call.name, result: { files } }
        } catch {
          return { name: call.name, result: { files: [] } }
        }
      }

      default:
        return { name: call.name, result: { error: `Unknown tool: ${call.name}` } }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { name: call.name, result: { error: message } }
  }
}
