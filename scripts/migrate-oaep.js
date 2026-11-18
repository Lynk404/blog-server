/*
 * 一次性迁移：密码密文填充方式 pkcs1 (PKCS#1 v1.5) -> pkcs1_oaep
 *
 *   node scripts/migrate-oaep.js          执行迁移
 *   node scripts/migrate-oaep.js --dry    只检查，不写库
 *
 * 背景：服务端 core/util/util.js 已改用 OAEP。数据库中已存的密码仍是两层 pkcs1 密文，
 * 不迁移会导致所有存量用户无法登录。
 *
 * 步骤：
 *   1. 备份全部用户密文到系统临时目录
 *   2. 逐个用户：旧填充解两层得明文 -> 新填充双层加密 -> 写回
 *
 * 密钥本身不变，只需迁移密文。中途失败时备份里仍是原始密文，可整体回滚。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const NodeRSA = require('node-rsa').default
const mongoose = require('mongoose')
const { dbURL } = require('../config')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')
const PUB = path.join(ROOT, 'auth/public.cer')
const PRI = path.join(ROOT, 'auth/private.cer')

const OLD_SCHEME = 'pkcs1'
const NEW_SCHEME = 'pkcs1_oaep'

function rsa (key, scheme) {
  const k = new NodeRSA(key)
  k.setOptions({ encryptionScheme: scheme })
  return k
}

async function main () {
  const pub = fs.readFileSync(PUB, 'utf8')
  const pri = fs.readFileSync(PRI, 'utf8')
  console.log('密钥位数:', rsa(pub, OLD_SCHEME).getKeySize())

  await mongoose.connect(dbURL)
  const db = mongoose.connection.db
  const users = await db.collection('users').find({}).project({ username: 1, password: 1 }).toArray()
  console.log('待迁移用户数:', users.length)

  // 用旧填充解出每个人的明文；任何一个失败就整体中止，避免部分迁移
  const plainById = new Map()
  for (const u of users) {
    if (!u.password) throw new Error(`用户 ${u.username} 没有密码字段`)
    const plain = rsa(pri, OLD_SCHEME).decrypt(rsa(pri, OLD_SCHEME).decrypt(u.password, 'utf8'), 'utf8')
    if (!plain) throw new Error(`用户 ${u.username} 解密结果为空`)
    // 若库里已经是 OAEP 密文，这里解不出合法明文，说明重复执行
    plainById.set(String(u._id), plain)
    console.log(`  解密成功: ${u.username}`)
  }

  // 用新填充重新双层加密，并自检能解回
  const newCipherById = new Map()
  for (const [id, plain] of plainById) {
    const inner = rsa(pub, NEW_SCHEME).encrypt(plain, 'base64')
    const outer = rsa(pub, NEW_SCHEME).encrypt(inner, 'base64')
    const back = rsa(pri, NEW_SCHEME).decrypt(rsa(pri, NEW_SCHEME).decrypt(outer, 'utf8'), 'utf8')
    if (back !== plain) throw new Error(`用户 ${id} 重加密自检失败`)
    newCipherById.set(id, outer)
  }
  console.log('全部用户重加密自检通过')

  if (DRY) {
    console.log('\n[dry] 未写入数据库')
    await mongoose.disconnect()
    return
  }

  const backupDir = path.join(os.tmpdir(), 'blog-oaep-migrate-' + Date.now())
  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(path.join(backupDir, 'users.json'), JSON.stringify(users, null, 2))
  console.log('备份目录:', backupDir)

  for (const [id, cipher] of newCipherById) {
    await db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { password: cipher } }
    )
  }
  console.log('已更新用户密文:', newCipherById.size)

  await mongoose.disconnect()
  console.log('\n迁移完成。旧密文备份在:', backupDir)
}

main().catch(async e => {
  console.error('迁移失败:', e.message)
  try { await mongoose.disconnect() } catch (_) {}
  process.exit(1)
})
