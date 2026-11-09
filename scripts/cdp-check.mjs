/**
 * 用 Chrome + CDP 打开页面，取渲染后的可见文本
 * 用法：node scripts/cdp-check.mjs <url> [等待毫秒] [--clicksel=.xxx]
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2]
const wait = Number(process.argv[3] || 3500)
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9411
const profile = mkdtempSync(join(tmpdir(), 'cdp-'))

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-proxy-server', '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' })

async function wsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const j = await r.json()
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('CDP 未就绪')
}

const ws = new WebSocket(await wsUrl())
await new Promise((r) => (ws.onopen = r))

let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id
  pending.set(mid, res)
  ws.send(JSON.stringify({ id: mid, method, params }))
})

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url })
await sleep(wait)

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}

const text = await evalJs('document.body.innerText')
console.log('=== URL:', url)
console.log('=== TITLE:', await evalJs('document.title'))
console.log('=== 文本长度:', (text || '').length)
console.log('=== 正文 ===')
console.log((text || '').slice(0, 3000))

ws.close()
chrome.kill()
