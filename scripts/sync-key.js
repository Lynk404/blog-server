/*
 * 把 auth/public.cer 同步到 Key 集合，供 GET /keys 返回给前端。
 *
 *   node scripts/sync-key.js          同步
 *
 * 为什么需要：GET /keys 返回 Key 集合第一条文档的 content，而代码中没有任何地方写入它。
 * 换密钥后忘了同步，前端拿到的公钥与服务端私钥不匹配，所有登录都会失败，且报错不指向原因。
 *
 * 做法：清空 Key 集合后插入一条当前公钥，保证有且只有一条。
 */
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const { dbURL } = require('../config')

const ROOT = path.resolve(__dirname, '..')
const PUB = path.join(ROOT, 'auth/public.cer')

async function main () {
  const content = fs.readFileSync(PUB, 'utf8')
  if (!content.includes('BEGIN PUBLIC KEY')) throw new Error('auth/public.cer 不是有效的 PEM 公钥')

  await mongoose.connect(dbURL)
  const db = mongoose.connection.db

  const { deletedCount } = await db.collection('keys').deleteMany({})
  await db.collection('keys').insertOne({ content, date: new Date() })

  console.log('已同步公钥到 Key 集合（清除旧记录 %d 条）', deletedCount)
  console.log('公钥长度: %d 字符', content.length)

  await mongoose.disconnect()
}

main().catch(async e => {
  console.error('同步失败:', e.message)
  try { await mongoose.disconnect() } catch (_) {}
  process.exit(1)
})
