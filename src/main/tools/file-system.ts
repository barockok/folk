import fs from 'fs'
import path from 'path'

export interface FileToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export class FileSystemTools {
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = path.resolve(workspacePath)
  }

  setWorkspace(newPath: string): void {
    this.workspacePath = path.resolve(newPath)
  }

  private ensureWithinWorkspace(targetPath: string): string {
    const resolved = path.resolve(this.workspacePath, targetPath)
    if (!resolved.startsWith(this.workspacePath + path.sep) && resolved !== this.workspacePath) {
      throw new Error(`Access denied: path "${targetPath}" is outside the workspace`)
    }
    return resolved
  }

  readFile(filePath: string): FileToolResult {
    try {
      const resolved = this.ensureWithinWorkspace(filePath)
      if (!fs.existsSync(resolved)) {
        return { success: false, error: `File not found: ${filePath}` }
      }
      const stats = fs.statSync(resolved)
      if (!stats.isFile()) {
        return { success: false, error: `Not a file: ${filePath}` }
      }
      const content = fs.readFileSync(resolved, 'utf-8')
      return {
        success: true,
        data: { content, path: path.relative(this.workspacePath, resolved) }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  writeFile(filePath: string, content: string): FileToolResult {
    try {
      const resolved = this.ensureWithinWorkspace(filePath)
      const parentDir = path.dirname(resolved)
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true })
      }
      fs.writeFileSync(resolved, content, 'utf-8')
      const bytesWritten = Buffer.byteLength(content, 'utf-8')
      return {
        success: true,
        data: {
          path: path.relative(this.workspacePath, resolved),
          bytesWritten
        }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  listDirectory(dirPath?: string): FileToolResult {
    try {
      const resolved = dirPath
        ? this.ensureWithinWorkspace(dirPath)
        : this.workspacePath
      if (!fs.existsSync(resolved)) {
        return { success: false, error: `Directory not found: ${dirPath ?? '.'}` }
      }
      const stats = fs.statSync(resolved)
      if (!stats.isDirectory()) {
        return { success: false, error: `Not a directory: ${dirPath ?? '.'}` }
      }
      const entries = fs.readdirSync(resolved).map((name) => {
        const entryPath = path.join(resolved, name)
        const entryStat = fs.statSync(entryPath)
        return {
          name,
          type: entryStat.isDirectory() ? 'directory' : 'file',
          size: entryStat.size,
          extension: entryStat.isFile() ? path.extname(name) : null
        }
      })
      return {
        success: true,
        data: { entries, path: path.relative(this.workspacePath, resolved) || '.' }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  createFile(filePath: string, content?: string): FileToolResult {
    try {
      const resolved = this.ensureWithinWorkspace(filePath)
      if (fs.existsSync(resolved)) {
        return { success: false, error: `File already exists: ${filePath}` }
      }
      const parentDir = path.dirname(resolved)
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true })
      }
      const fileContent = content ?? ''
      fs.writeFileSync(resolved, fileContent, 'utf-8')
      return {
        success: true,
        data: {
          path: path.relative(this.workspacePath, resolved),
          bytesWritten: Buffer.byteLength(fileContent, 'utf-8')
        }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  getToolDefinitions(): object[] {
    return [
      {
        name: 'read_file',
        description:
          'Read the contents of a file at the given path relative to the workspace.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The file path relative to the workspace root'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description:
          'Write content to a file at the given path relative to the workspace. Creates parent directories if needed.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The file path relative to the workspace root'
            },
            content: {
              type: 'string',
              description: 'The content to write to the file'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'list_directory',
        description:
          'List the contents of a directory relative to the workspace. If no path is given, lists the workspace root.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The directory path relative to the workspace root (optional)'
            }
          },
          required: []
        }
      },
      {
        name: 'create_file',
        description:
          'Create a new file at the given path. Fails if the file already exists.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The file path relative to the workspace root'
            },
            content: {
              type: 'string',
              description: 'Optional initial content for the file'
            }
          },
          required: ['path']
        }
      }
    ]
  }

  executeTool(toolName: string, input: Record<string, unknown>): FileToolResult {
    switch (toolName) {
      case 'read_file':
        return this.readFile(input.path as string)
      case 'write_file':
        return this.writeFile(input.path as string, input.content as string)
      case 'list_directory':
        return this.listDirectory(input.path as string | undefined)
      case 'create_file':
        return this.createFile(input.path as string, input.content as string | undefined)
      default:
        return { success: false, error: `Unknown tool: ${toolName}` }
    }
  }
}
