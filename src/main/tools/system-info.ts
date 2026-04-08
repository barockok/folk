import os from 'os'

export interface SystemInfoResult {
  success: boolean
  data?: unknown
  error?: string
}

export class SystemInfoTool {
  getSystemInfo(): SystemInfoResult {
    return {
      success: true,
      data: {
        platform: process.platform,
        arch: process.arch,
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
        freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)) + ' GB',
        osVersion: os.release(),
        nodeVersion: process.version,
        uptime: Math.round(os.uptime() / 3600) + ' hours',
      },
    }
  }

  getToolDefinitions(): object[] {
    return [
      {
        name: 'system_info',
        description: 'Get information about the system: OS, architecture, CPU count, memory, and versions.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
    ]
  }

  executeTool(toolName: string): SystemInfoResult {
    if (toolName === 'system_info') {
      return this.getSystemInfo()
    }
    return { success: false, error: `Unknown tool: ${toolName}` }
  }
}
