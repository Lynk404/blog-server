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
// 与 core/util/util.js 的 ENCRYPTION_SCHEME 保持一致（OAEP，SHA-1）
pub.setOptions({ encryptionScheme: 'pkcs1_oaep' })
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
  check('点赞（无 token）→ 401', (await call(c.base, 'POST', '/articles/likes/' + aid)).status, 401)
  check('未登录点赞不计数', (await getArt(c.base, aid)).like_num - before, 0)
  check('点赞（登录）→ 200', (await call(c.base, 'POST', '/articles/likes/' + aid, c.t)).status, 200)
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
  check('注销后 GET /user → 401（不再 500）', (await call(c.base, 'GET', '/user', C)).status, 401)

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

// 临时用户：用户名 6-8 位字母数字，密码满足 8-12 位大小写+数字
async function newUser (base, tag) {
  const n = String(Math.floor(10000 + Math.random() * 89999))
  const u = { u: tag + n, p: 'Abcdefg12' }
  const reg = await call(base, 'POST', '/admin/register', null, {
    username: u.u, password: enc(u.p), email: `${tag}${n}@example.com`, nikname: '回归'
  })
  return { u, tok: reg.body.data.token }
}

async function scenarioUserEdit (c) {
  const A = await newUser(c.base, 'rgu')
  const avatar = 'http://127.0.0.1:3000/images/rg.png'
  check('改头像（PUT /user avatar）→ 200', (await call(c.base, 'PUT', '/user', A.tok, { avatar })).status, 200)
  check('头像已写入', (await call(c.base, 'GET', '/user', A.tok)).body.data.avatar, avatar)
  // 旧 token 的 iat 必须早于改密码的秒级时间戳，否则会与"同秒签发"的边界混在一起
  await sleep(1100)
  const newPwd = 'Zyxwvut98'
  check('改密码（带旧密码）→ 200', (await call(c.base, 'PUT', '/user', A.tok, { password: enc(newPwd), oldPassword: enc(A.u.p) })).status, 200)
  check('改密码后旧 token 被拒 → 400', (await call(c.base, 'PUT', '/user', A.tok, { nikname: 'x' })).status, 400)
  const fresh = await login(c.base, { u: A.u.u, p: newPwd })
  check('新密码可登录并拿到新 token', !!fresh, true)
  check('新 token 可用 → 200', (await call(c.base, 'GET', '/user', fresh)).status, 200)
  check('清理临时用户 → 200', (await call(c.base, 'DELETE', '/user', fresh, { password: enc(newPwd) })).status, 200)
}

async function scenarioColumnCascade (c) {
  const O = await newUser(c.base, 'rgc')
  const col = await mkCol(c.base, O.tok)
  const own = await mkArt(c.base, O.tok, col, 'rg-casc-own')
  // 他人文章挂在 O 的专栏下：API 已禁止（403），这里直接写库制造存量数据，验证级联逻辑仍覆盖它
  const tid = JSON.parse(Buffer.from(c.t.split('.')[1], 'base64url').toString())._id
  await mongoose.connect(MONGO_URI)
  const othersId = new mongoose.Types.ObjectId()
  await mongoose.connection.db.collection('articles').insertOne({ _id: othersId, title: 'rg-casc-other', content: 'c', cover: '', date: new Date(), hit_num: 0, comment_num: 0, like_num: 0, comments: [], author: new mongoose.Types.ObjectId(tid), column: new mongoose.Types.ObjectId(col) })
  await mongoose.connection.db.collection('columns').updateOne({ _id: new mongoose.Types.ObjectId(col) }, { $push: { aids: othersId } })
  await mongoose.disconnect()
  const others = String(othersId)
  await call(c.base, 'POST', '/api/rest/comments', O.tok, { content: 'rg-casc-c1', aid: others })
  check('级联前他人文章存在', (await call(c.base, 'GET', '/api/rest/articles/' + others)).status, 200)
  check('非专栏主人删除 → 403', (await call(c.base, 'DELETE', '/api/rest/columns/' + col, c.t)).status, 403)
  check('专栏主人删除 → 200', (await call(c.base, 'DELETE', '/api/rest/columns/' + col, O.tok)).status, 200)
  check('级联：本人文章删除', (await call(c.base, 'GET', '/api/rest/articles/' + own)).status, 404)
  check('级联：他人文章删除', (await call(c.base, 'GET', '/api/rest/articles/' + others)).status, 404)
  check('清理临时用户 → 200', (await call(c.base, 'DELETE', '/user', O.tok, { password: enc(O.u.p) })).status, 200)
}

// 错误路径：无效 ID → 404，非法密文 → 422，中文必填/重名提示，评论不能挂到不存在的文章上
async function scenarioErrors (c) {
  check('无效 ID 详情 → 404', (await call(c.base, 'GET', '/api/rest/articles/notanid')).status, 404)
  check('无效 ID 点赞 → 404', (await call(c.base, 'POST', '/articles/likes/notanid', c.t)).status, 404)
  check('登录密文非法 → 422', (await call(c.base, 'POST', '/admin/login', null, { username: USER1.u, password: 'abc' })).status, 422)

  const name = 'rg-dup-' + uniq()
  const first = await call(c.base, 'POST', '/api/rest/columns', c.t, { name })
  check('专栏首次创建 → 200', first.status, 200)
  const dup = await call(c.base, 'POST', '/api/rest/columns', c.t, { name })
  check('专栏重名 → 422', dup.status, 422)
  check('专栏重名提示中文', dup.body.message, '专栏名不能重复')
  await call(c.base, 'DELETE', '/api/rest/columns/' + first.body.data.id, c.t)

  const noName = await call(c.base, 'POST', '/api/rest/columns', c.t, {})
  check('专栏缺名 → 中文必填提示', noName.body.message, '专栏名必填')

  const col = await mkCol(c.base, c.t)
  const noContent = await call(c.base, 'POST', '/api/rest/articles', c.t, { title: 't', column: col })
  check('文章缺内容 → 中文必填提示', noContent.body.message, '内容必填')
  const ghostCol = await call(c.base, 'POST', '/api/rest/articles', c.t, { title: 't', content: 'c', column: '000000000000000000000000' })
  check('文章挂到不存在的专栏 → 422', ghostCol.status, 422)
  check('文章挂到不存在的专栏提示', ghostCol.body.message, '专栏不存在')
  // 文章只能挂到自己的专栏：他人专栏返回 403，且不写入
  const other = await newUser(c.base, 'rgo')
  const otherCol = await mkCol(c.base, other.tok)
  const foreign = await call(c.base, 'POST', '/api/rest/articles', c.t, { title: 'rg-foreign', content: 'c', column: otherCol })
  check('文章挂到他人专栏 → 403', foreign.status, 403)
  check('文章挂到他人专栏提示', foreign.body.message, '无权添加到该专栏')
  await call(c.base, 'DELETE', '/user', other.tok, { password: enc(other.u.p) })

  // 公开列表：禁止 Mongo 操作符，size 上限 100
  check('查询含 $where → 400', (await call(c.base, 'GET', '/api/rest/articles?query[$where]=1')).status, 400)
  check('查询含嵌套操作符 → 400', (await call(c.base, 'GET', '/api/rest/articles?query[title][$ne]=x')).status, 400)
  const big = await call(c.base, 'GET', '/api/rest/articles?size=100000')
  check('size 上限为 100', big.body.data.size, 100)

  // 注册弱密码/非法密文：统一为密码格式提示，不再暴露类型转换错误
  const weak = await call(c.base, 'POST', '/admin/register', null, { username: 'rgw' + String(Math.floor(10000 + Math.random() * 89999)), password: 'Abc', email: `rgw${uniq()}@example.com` })
  check('注册非法密文 → 422', weak.status, 422)
  check('登录原型链属性 → 400', (await call(c.base, 'POST', '/admin/constructor', c.t, { username: 'a', password: enc('b') })).status, 400)
  check('注册非法密文提示', weak.body.message, '密码必须为 数字+密码(大小写) 8-12位')

  const ghostArtTitle = 'rg-ghost-art-' + uniq()
  await call(c.base, 'POST', '/api/rest/articles', c.t, { title: ghostArtTitle, content: 'c', column: '000000000000000000000000' })
  const ghostArtList = await call(c.base, 'GET', '/api/rest/articles?query[title]=' + ghostArtTitle)
  check('孤儿文章未写入', ghostArtList.body.data.total, 0)

  const ghostText = 'rg-ghost-' + uniq()
  const ghost = await call(c.base, 'POST', '/api/rest/comments', c.t, { content: ghostText, aid: '000000000000000000000000' })
  check('评论挂到不存在的文章 → 422', ghost.status, 422)
  check('评论挂到不存在的文章提示', ghost.body.message, '文章不存在')
  const ghostList = await call(c.base, 'GET', '/api/rest/comments?query[content]=' + ghostText)
  check('孤儿评论未写入', ghostList.body.data.total, 0)
  const noAid = await call(c.base, 'POST', '/api/rest/comments', c.t, { content: 'x' })
  check('评论缺文章 → 中文必填提示', noAid.body.message, '文章必填')

  await call(c.base, 'DELETE', '/api/rest/columns/' + col, c.t)
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
    check('上传图片 → 200', await up(t, Buffer.from('hi'), 'a.png'), 200)
    check('上传非图片 → 422', await up(t, Buffer.from('hi'), 'x.html'), 422)
    check('上传超限图片 → 422', await up(t, Buffer.alloc(200 * 1024, 97), 'b.png'), 422)
    check('未知分类 → 400', (await fetch(`${srv.base}/upload/bogus`, { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: (() => { const fd = new FormData(); fd.append('file', new Blob([Buffer.from('hi')]), 'c.png'); return fd })() })).status, 400)
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
      ['JWT 鉴权', () => scenarioJwt(c)],
      ['用户资料（头像与改密码）', () => scenarioUserEdit(c)],
      ['专栏级联删除', () => scenarioColumnCascade(c)],
      ['错误路径与校验', () => scenarioErrors(c)]
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
