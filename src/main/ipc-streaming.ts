import { BrowserWindow } from 'electron'
import { AgentManager } from './agent-manager'

export function wireStreaming(agent: AgentManager, win: BrowserWindow): void {
  const send = (channel: string, payload: unknown): void => {
    if (win.isDestroyed()) return
    win.webContents.send(channel, payload)
  }
  agent.on('chunk', (e) => send('agent:chunk', e))
  agent.on('thinking', (e) => send('agent:thinking', e))
  agent.on('toolCall', (e) => send('agent:toolCall', e))
  agent.on('toolResult', (e) => send('agent:toolResult', e))
  agent.on('done', (e) => send('agent:done', e))
  agent.on('error', (e) => send('agent:error', e))
  agent.on('notice', (e) => send('agent:notice', e))
  agent.on('usage', (e) => send('agent:usage', e))
}
