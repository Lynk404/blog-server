#!/usr/bin/env node
/*
 * 端到端回归（临时保留，未纳入 git）
 *   node scripts/regress/run.js              全部用例
 *   node scripts/regress/run.js --no-upload  跳过上传用例（不写任何文件）
 *
 * - 测试账号读取 .env.local（TEST_USER_1_*、TEST_USER_2_*），代码中不硬编码密码。
 * - 服务由本脚本启动，结束时只关闭自己的子进程，不影响 3000 端口的 dev server。
 * - 所有测试数据（专栏、文章、评论、临时用户）由脚本自建并清理，不依赖数据库中的固定 ID。
 * - 上传用例在系统临时目录的沙箱中运行，不写入仓库 uploads/。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const net = require('net')
const cp = require('child_process')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '../..')
const dep = m => require(require.resolve(m, { paths: [ROOT] }))
const NodeRSA = dep('node-rsa').default
const mongoose = dep('mongoose')
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- 配置 ----------
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)
    .filter(l => /^[A-Z_0-9]+=/.test(l)).map(l => l.split(/=(.*)/).slice(0, 2))
)
const USER1 = { u: env.TEST_USER_1_USERNAME, p: env.TEST_USER_1_PASSWORD } // Postman1，数据库已有
const USER2 = { u: env.TEST_USER_2_USERNAME, p: env.TEST_USER_2_PASSWORD } // Tester01，持久测试用户
const MONGO_URI = 'mongodb://127.0.0.1:27017/db_blog'

const pub = new NodeRSA(fs.readFileSync(path.join(ROOT, 'auth/public.cer'), 'utf8'))
pub.setOptions({ encryptionScheme: 'pkcs1' })
const enc = s => pub.encrypt(s, 'base64')

// ---------- 结果记录 ----------
const results = []
function check (name, got, want) {
  const ok = got === want
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

// ---------- 基础设施 ----------
function freePort () {
  return new Promise(resolve => {
    const s = net.createServer().listen(0, () => {
      const port = s.address().port
      s.close(() => resolve(port))
    })
  })
}

async function startServer (cwd) {
  const port = await freePort()
  const child = cp.spawn(process.execPath, ['bin/www'], {
    cwd, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  })
  let log = ''
  child.stdout.on('data', d => { log += d })
  child.stderr.on('data', d => { log += d })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base + '/keys')
      if (r.status) return { child, base, log: () => log }
    } catch (e) { /* 还没起来 */ }
    await sleep(250)
  }
  child.kill()
  throw new Error('服务未能启动:\n' + log.slice(-800))
}

async function call (base, method, p, token, body) {
  const r = await fetch(base + p, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch (e) { json = text }
  return { status: r.status, body: json }
}

async function login (base, user) {
  const r = await call(base, 'POST', '/admin/login', null, { username: user.u, password: enc(user.p) })
  return r.body && r.body.data ? r.body.data.token : null
}

async function ensureTester (base) {
  const t = await login(base, USER2)
  if (t) return t
  const r = await call(base, 'POST', '/admin/register', null, {
    username: USER2.u, password: enc(USER2.p), email: `${USER2.u.toLowerCase()}@example.com`, nikname: '测试用户'
  })
  return r.body.data.token
}

const uniq = () => Math.random().toString(36).slice(2, 7)
async function mkCol (base, tok) {
  const r = await call(base, 'POST', '/api/rest/columns', tok, { name: 'rg-col-' + uniq() })
  return r.body.data.id
}
async function mkArt (base, tok, col, title) {
  const r = await call(base, 'POST', '/api/rest/articles', tok, { title, content: 'regress content', column: col })
  return r.body.data.id
}
async function getArt (base, aid) {
  return (await call(base, 'GET', '/api/rest/articles/' + aid)).body.data
}

// ---------- 用例 ----------
async function scenarioArticles (c) {
  const col = await mkCol(c.base, c.t)
  const aid = await mkArt(c.base, c.t, col, 'rg-art')
  check('创建文章', !!aid, true)
  check('非作者 PUT 文章 → 400', (await call(c.base, 'PUT', '/api/rest/articles/' + aid, c.p, { title: 'x' })).status, 400)
  check('非作者 DELETE 文章 → 403', (await call(c.base, 'DELETE', '/api/rest/articles/' + aid, c.p)).status, 403)
  check('非作者操作后文章仍在', (await call(c.base, 'GET', '/api/rest/articles/' + aid)).status, 200)
  const colAids = async () => ((await call(c.base, 'GET', '/api/rest/columns/' + col)).body.data.aids || []).map(a => String(a._id || a))
  check('专栏 aids 包含文章', (await colAids()).includes(aid), true)
  check('作者 DELETE 文章 → 200', (await call(c.base, 'DELETE', '/api/rest/articles/' + aid, c.t)).status, 200)
  check('删除后文章 404', (await call(c.base, 'GET', '/api/rest/articles/' + aid)).status, 404)
  check('删除后专栏 aids 已移除', (await colAids()).includes(aid), false)
  await call(c.base, 'DELETE', '/api/rest/columns/' + col, c.t)
}

async function scenarioSearchLikes (c) {
  check('搜索（无 token）→ 200', (await call(c.base, 'GET', '/articles/search?query[q]=a')).status, 200)
  check('搜索缺 q → 400', (await call(c.base, 'GET', '/articles/search')).status, 400)
  check('搜索 POST 不在白名单 → 401', (await call(c.base, 'POST', '/articles/search', null, {})).status, 401)
  check('点赞 GET 不在白名单 → 401', (await call(c.base, 'GET', '/articles/likes/x')).status, 401)
  const col = await mkCol(c.base, c.t)
  const aid = await mkArt(c.base, c.t, col, 'rg-like')
  const before = (await getArt(c.base, aid)).like_num
  check('点赞（无 token）→ 200', (await call(c.base, 'POST', '/articles/likes/' + aid)).status, 200)
  check('like_num +1', (await getArt(c.base, aid)).like_num - before, 1)
  await call(c.base, 'DELETE', '/api/rest/articles/' + aid, c.t)
  await call(c.base, 'DELETE', '/api/rest/columns/' + col, c.t)
}

async function scenarioCancel (c) {
  const n = String(Math.floor(10000 + Math.random() * 89999))
  const cu = { u: 'cx' + n, p: USER2.p }
  const reg = await call(c.base, 'POST', '/admin/register', null, { username: cu.u, password: enc(cu.p), email: `cx${n}@example.com`, nikname: '注销测试' })
  const C = reg.body.data.token
  const col1 = await mkCol(c.base, C)
  const a1 = await mkArt(c.base, C, col1, 'rg-cancel-a1')
  await call(c.base, 'POST', '/api/rest/comments', c.t, { content: 'rg-on-a1', aid: a1 })
  const colT = await mkCol(c.base, c.t)
  const a3 = await mkArt(c.base, c.t, colT, 'rg-cancel-a3')
  await call(c.base, 'POST', '/api/rest/comments', C, { content: 'rg-on-a3', aid: a3 })
  check('注销前他人文章计数为 1', (await getArt(c.base, a3)).comment_num, 1)

  check('注销缺密码 → 422', (await call(c.base, 'DELETE', '/user', C, {})).status, 422)
  check('注销密码错误 → 422', (await call(c.base, 'DELETE', '/user', C, { password: enc('Wrong1234') })).status, 422)
  check('注销正确密码 → 200', (await call(c.base, 'DELETE', '/user', C, { password: enc(cu.p) })).status, 200)
  check('级联：自己的文章删除', (await call(c.base, 'GET', '/api/rest/articles/' + a1)).status, 404)
  check('级联：他人评论的计数回退', (await getArt(c.base, a3)).comment_num, 0)
  check('注销后旧 token 被拒（PUT /user）', (await call(c.base, 'PUT', '/user', C, { nikname: 'x' })).status, 400)
  check('注销后无法登录 → 422', (await call(c.base, 'POST', '/admin/login', null, { username: cu.u, password: enc(cu.p) })).status, 422)

  await call(c.base, 'DELETE', '/api/rest/articles/' + a3, c.t)
  await call(c.base, 'DELETE', '/api/rest/columns/' + colT, c.t)
}

async function scenarioJwt (c) {
  check('JWT 新签发 token → GET /user 200', (await call(c.base, 'GET', '/user', c.p)).status, 200)
  check('无 token → 401', (await call(c.base, 'GET', '/user')).status, 401)
  const payload = JSON.parse(Buffer.from(c.p.split('.')[1], 'base64url').toString())
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const hdr = b64({ alg: 'RS256', typ: 'JWT' })
  const pl = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 })
  const oldPri = fs.readFileSync(path.join(ROOT, 'auth/private.cer'), 'utf8') // 密码密钥签发的旧 token
  const sig = crypto.sign('RSA-SHA256', Buffer.from(hdr + '.' + pl), oldPri).toString('base64url')
  check('旧密码密钥签发的 token → 401', (await call(c.base, 'GET', '/user', hdr + '.' + pl + '.' + sig)).status, 401)
  const parts = c.p.split('.')
  const forged = parts[0] + '.' + b64({ ...payload, _id: '000000000000000000000000' }) + '.' + parts[2]
  check('篡改载荷的 token → 401', (await call(c.base, 'GET', '/user', forged)).status, 401)
}

async function scenarioUpload (dir, t) {
  const srv = await startServer(dir)
  try {
    const up = async (tok, buf, name) => {
      const fd = new FormData()
      fd.append('file', new Blob([buf]), name)
      const r = await fetch(`${srv.base}/upload/article`, { method: 'POST', headers: tok ? { Authorization: 'Bearer ' + tok } : {}, body: fd })
      return r.status
    }
    check('上传小文件 → 200', await up(t, Buffer.from('hi'), 'a.txt'), 200)
    check('上传超限文件 → 422', await up(t, Buffer.alloc(200 * 1024, 97), 'b.txt'), 422)
    check('上传无 token → 401', await up(null, Buffer.from('x'), 'c.txt'), 401)
  } finally {
    srv.child.kill()
  }
}

function prepareSandbox () {
  const dir = path.join(os.tmpdir(), 'blog-regress-sandbox')
  fs.mkdirSync(path.join(dir, 'uploads', 'article'), { recursive: true })
  for (const n of ['app.js', 'config.js', 'package.json', 'bin', 'core', 'models', 'middleware', 'plugins', 'routes', 'public', 'auth']) {
    fs.cpSync(path.join(ROOT, n), path.join(dir, n), { recursive: true })
  }
  const nm = path.join(dir, 'node_modules')
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(ROOT, 'node_modules'), nm, 'junction')
  return dir
}

async function audit () {
  await mongoose.connect(MONGO_URI)
  const db = mongoose.connection.db
  const arts = await db.collection('articles').find({}).toArray()
  const cms = await db.collection('comments').find({}).toArray()
  const cols = await db.collection('columns').find({}).toArray()
  let bad = 0
  for (const a of arts) {
    const ids = cms.filter(c => c.aid && String(c.aid) === String(a._id)).map(c => String(c._id))
    const arr = (a.comments || []).map(String)
    if (a.comment_num !== ids.length || arr.length !== ids.length || ids.some(i => !arr.includes(i))) {
      bad++; console.log('  不一致文章:', String(a._id))
    }
  }
  for (const c of cols) {
    const want = arts.filter(a => String(a.column) === String(c._id)).map(a => String(a._id))
    const got = (c.aids || []).map(String)
    if (want.length !== got.length || want.some(i => !got.includes(i))) { bad++; console.log('  不一致专栏:', c.name) }
  }
  for (const c of cms) {
    if (c.aid && !arts.some(a => String(a._id) === String(c.aid))) { bad++; console.log('  孤立评论:', String(c._id)) }
  }
  await mongoose.disconnect()
  check('数据库一致性（文章/专栏/评论）', bad, 0)
}

// ---------- 主流程 ----------
async function main () {
  const withUpload = !process.argv.includes('--no-upload')
  const srv = await startServer(ROOT)
  let failed = false
  try {
    const base = srv.base
    const t = await ensureTester(base)
    const p = await login(base, USER1)
    if (!t || !p) throw new Error('测试账号登录失败，请检查 .env.local 与数据库')
    const c = { base, t, p }
    for (const [name, fn] of [
      ['文章权限', () => scenarioArticles(c)],
      ['搜索与点赞白名单', () => scenarioSearchLikes(c)],
      ['注销级联', () => scenarioCancel(c)],
      ['JWT 鉴权', () => scenarioJwt(c)]
    ]) {
      console.log(`--- ${name}`)
      try { await fn() } catch (e) { check(`${name} 异常: ${e.message}`, true, false) }
    }
    if (withUpload) {
      console.log('--- 上传（沙箱）')
      try { await scenarioUpload(prepareSandbox(), t) } catch (e) { check(`上传异常: ${e.message}`, true, false) }
    }
    console.log('--- 数据库审计')
    await audit()
  } finally {
    srv.child.kill()
    failed = results.some(r => !r.ok)
    if (failed) console.log('--- 服务日志（末尾）\n' + srv.log().slice(-1200))
  }
  const passed = results.filter(r => r.ok).length
  console.log(`\n结果：${passed}/${results.length} 通过`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error('脚本失败:', e); process.exit(2) })
