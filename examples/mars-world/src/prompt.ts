/**
 * Says something to Agnes for the person at the page: `hub/prompt` posts their words into the
 * conversation that last used a device (hub-api.md section 15.3). Resolves whether it was posted.
 */
export function say(hub: string, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(new URL('/ws/hub', hub.replace(/^http/, 'ws')).href)
    const send = (id: string, method: string, params: Record<string, unknown>) =>
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    ws.onopen = () => {
      send('1', 'hub/hello', { role: 'ui', client: { name: 'Mars world' } })
      send('2', 'hub/prompt', { text })
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as { id?: string; result?: { posted?: boolean } }
      if (m.id !== '2') return
      resolve(m.result?.posted === true)
      ws.close()
    }
    ws.onerror = () => resolve(false)
  })
}
