/**
 * Measure admin layout widths using Chrome CDP (page target).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, accessSync, constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import net from 'node:net'
import http from 'node:http'
import crypto from 'node:crypto'
import { URL } from 'node:url'

const BASE = process.env.ADMIN_URL || 'http://127.0.0.1:5173'
const USER = process.env.ADMIN_USER || 'admin'
const PASS = process.env.ADMIN_PASS || '12345678'
const WIDTHS = [1440, 1280, 1024, 768, 390]

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function exists(p) {
  try {
    accessSync(p, constants.R_OK)
    return true
  } catch {
    return false
  }
}

function pickChrome() {
  for (const p of chromeCandidates) if (p && exists(p)) return p
  throw new Error('Chrome/Edge not found')
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
    s.on('error', reject)
  })
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error(`bad json from ${url}: ${data.slice(0, 200)}`))
          }
        })
      })
      .on('error', reject)
  })
}

class SimpleWS {
  constructor(url) {
    this.url = url
    this.callbacks = new Map()
    this.id = 0
    this.buf = Buffer.alloc(0)
    this.openPromise = this.#connect()
  }

  #connect() {
    const u = new URL(this.url)
    const key = crypto.randomBytes(16).toString('base64')
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': key,
            Host: `${u.hostname}:${u.port}`,
          },
        },
        () => {},
      )
      req.on('upgrade', (_res, socket) => {
        this.socket = socket
        socket.on('data', (chunk) => this.#onData(chunk))
        socket.on('error', reject)
        resolve()
      })
      req.on('error', reject)
      req.end()
    })
  }

  #onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk])
    while (this.buf.length >= 2) {
      const b0 = this.buf[0]
      const b1 = this.buf[1]
      const opcode = b0 & 0xf
      const masked = (b1 & 0x80) !== 0
      let len = b1 & 0x7f
      let offset = 2
      if (len === 126) {
        if (this.buf.length < 4) return
        len = this.buf.readUInt16BE(2)
        offset = 4
      } else if (len === 127) {
        if (this.buf.length < 10) return
        len = Number(this.buf.readBigUInt64BE(2))
        offset = 10
      }
      let mask
      if (masked) {
        if (this.buf.length < offset + 4) return
        mask = this.buf.subarray(offset, offset + 4)
        offset += 4
      }
      if (this.buf.length < offset + len) return
      let payload = this.buf.subarray(offset, offset + len)
      this.buf = this.buf.subarray(offset + len)
      if (masked && mask) {
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))
      }
      if (opcode === 1 || opcode === 0) {
        try {
          const msg = JSON.parse(payload.toString('utf8'))
          if (msg.id && this.callbacks.has(msg.id)) {
            const { resolve, reject } = this.callbacks.get(msg.id)
            this.callbacks.delete(msg.id)
            if (msg.error) reject(new Error(JSON.stringify(msg.error)))
            else resolve(msg.result)
          }
        } catch {
          /* ignore partial */
        }
      } else if (opcode === 8) {
        this.socket.end()
      } else if (opcode === 9) {
        // ping -> pong
        this.#frame(payload, 0x8a)
      }
    }
  }

  #frame(data, opcode = 0x81) {
    const len = data.length
    const maskKey = crypto.randomBytes(4)
    let header
    if (len < 126) {
      header = Buffer.alloc(2)
      header[0] = opcode
      header[1] = 0x80 | len
    } else if (len < 65536) {
      header = Buffer.alloc(4)
      header[0] = opcode
      header[1] = 0x80 | 126
      header.writeUInt16BE(len, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = opcode
      header[1] = 0x80 | 127
      header.writeBigUInt64BE(BigInt(len), 2)
    }
    const masked = Buffer.alloc(len)
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ maskKey[i % 4]
    this.socket.write(Buffer.concat([header, maskKey, masked]))
  }

  send(obj) {
    this.#frame(Buffer.from(JSON.stringify(obj)), 0x81)
  }

  async call(method, params = {}, timeoutMs = 30000) {
    await this.openPromise
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject })
      this.send({ id, method, params })
      setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, timeoutMs)
    })
  }

  close() {
    try {
      this.socket?.end()
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const chrome = pickChrome()
  const port = await freePort()
  const userData = mkdtempSync(join(tmpdir(), 'admin-layout-'))
  const child = spawn(
    chrome,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let ready = false
  for (let i = 0; i < 50; i++) {
    try {
      await httpGetJson(`http://127.0.0.1:${port}/json/version`)
      ready = true
      break
    } catch {
      await sleep(200)
    }
  }
  if (!ready) throw new Error('CDP not ready')

  // Prefer a page target websocket
  let pageWsUrl
  for (let i = 0; i < 20; i++) {
    const list = await httpGetJson(`http://127.0.0.1:${port}/json/list`)
    const page = list.find((t) => t.type === 'page') || list[0]
    if (page?.webSocketDebuggerUrl) {
      pageWsUrl = page.webSocketDebuggerUrl
      break
    }
    await sleep(200)
  }
  if (!pageWsUrl) throw new Error('no page target')

  const ws = new SimpleWS(pageWsUrl)
  await ws.openPromise
  await ws.call('Page.enable')
  await ws.call('Runtime.enable')

  async function evalExpr(expression) {
    const r = await ws.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result?.value
  }

  async function setViewport(width, height = 900) {
    await ws.call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768,
    })
  }

  // login for token
  const loginRes = await fetch(`${BASE}/admin/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const loginJson = await loginRes.json()
  const token = loginJson.token
  if (!token) throw new Error('login failed: ' + JSON.stringify(loginJson))

  await setViewport(1440, 900)
  await ws.call('Page.navigate', { url: `${BASE}/login` })
  await sleep(1000)
  await evalExpr(
    `localStorage.setItem('admin_token', ${JSON.stringify(token)}); localStorage.setItem('admin_username', ${JSON.stringify(USER)});`,
  )
  await ws.call('Page.navigate', { url: `${BASE}/dashboard` })
  await sleep(1500)

  const results = []
  for (const w of WIDTHS) {
    await setViewport(w, w <= 768 ? 844 : 900)
    await sleep(400)
    await evalExpr('window.dispatchEvent(new Event("resize"))')
    await sleep(400)
    const m = await evalExpr(`(() => {
      let siderW = 0;
      let siderH = 0;
      let siderVisible = false;
      document.querySelectorAll('.n-layout-sider').forEach(el => {
        const r = el.getBoundingClientRect();
        const disp = getComputedStyle(el).display;
        if (r.width > 1 && disp !== 'none') {
          siderW = Math.round(r.width);
          siderH = Math.round(r.height);
          siderVisible = true;
        }
      });
      const shellEl = document.querySelector('.shell');
      const mainEl = document.querySelector('.shell-main');
      const page = document.querySelector('.page');
      const content = document.querySelector('.n-layout-content, .shell-content');
      const shellH = shellEl ? Math.round(shellEl.getBoundingClientRect().height) : 0;
      const mainW = mainEl ? Math.round(mainEl.getBoundingClientRect().width) : 0;
      const pageW = page ? Math.round(page.getBoundingClientRect().width) : 0;
      const contentW = content ? Math.round(content.getBoundingClientRect().width) : 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const hamburger = !!document.querySelector('.shell-header button[aria-label="打开导航"]');
      const drawer = document.querySelector('.n-drawer');
      return {
        vw,
        vh,
        shellH,
        siderW,
        siderH,
        siderVisible,
        mainW,
        contentW,
        pageW,
        siderRatio: vw ? Number((siderW / vw).toFixed(3)) : null,
        hasNaiveSider: !!document.querySelector('.n-layout-sider'),
        hasNaiveMenu: !!document.querySelector('.n-menu'),
        hasDrawerDom: !!drawer,
        hasHamburger: hamburger,
        path: location.pathname,
        title: document.title,
      };
    })()`)
    results.push({ width: w, ...m })
  }

  const pageResults = []
  await setViewport(1440, 900)
  for (const path of ['/dashboard', '/orders', '/merchants', '/settings']) {
    await ws.call('Page.navigate', { url: `${BASE}${path}` })
    await sleep(800)
    pageResults.push(await evalExpr(`(() => {
      const sider = [...document.querySelectorAll('.n-layout-sider')].find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && getComputedStyle(el).display !== 'none';
      });
      const main = document.querySelector('.shell-main');
      const sr = sider?.getBoundingClientRect();
      const mr = main?.getBoundingClientRect();
      return {
        path: location.pathname,
        viewportH: innerHeight,
        siderH: sr ? Math.round(sr.height) : 0,
        siderBottom: sr ? Math.round(sr.bottom) : 0,
        mainW: mr ? Math.round(mr.width) : 0,
        themeToggleVisible: !!document.querySelector('.theme-toggle-btn'),
      };
    })()`))
  }

  console.log(JSON.stringify({ ok: true, base: BASE, results, pageResults }, null, 2))
  ws.close()
  child.kill()
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && (e.stack || e)) }))
  process.exit(1)
})
