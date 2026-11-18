/*
 * 一次性迁移：密码加密密钥 512 -> 2048 位
 *
 *   node scripts/migrate-keys-2048.js          执行迁移
 *   node scripts/migrate-keys-2048.js --dry    只检查，不写库不写文件
 *
 * 步骤：
 *   1. 备份新旧文件与全部用户密文到系统临时目录
 *   2. 生成 2048 位密钥对，替换 auth/public.cer、auth/private.cer
 *   3. 逐个用户：旧密钥解出明文 -> 新密钥重新双层加密 -> 写回
 *   4. 更新 Key 集合中保存的公钥
 *
 * 中途失败时旧密钥和旧密文都还在备份里，可整体回滚。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const NodeRSA = require('node-rsa').default
const mongoose = require('mongoose')
const { dbURL } = require('../config')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')
const PUB = path.join(ROOT, 'auth/public.cer')
const PRI = path.join(ROOT, 'auth/private.cer')

// 当前填充方式。2026-11 已从 pkcs1 切换到 OAEP，存量密文也是 OAEP。
// 若数据库仍是 pkcs1 旧密文，先用 migrate-oaep.js 迁移，或把这里改回 'pkcs1'。
const SCHEME = 'pkcs1_oaep'

const rsa = (key) => {
  const k = new NodeRSA(key)
  k.setOptions({ encryptionScheme: SCHEME })
  return k
}

async function main () {
  const oldPub = fs.readFileSync(PUB, 'utf8')
  const oldPri = fs.readFileSync(PRI, 'utf8')
  console.log('旧密钥位数:', rsa(oldPub).getKeySize())

  await mongoose.connect(dbURL)
  const db = mongoose.connection.db
  const users = await db.collection('users').find({}).project({ username: 1, password: 1 }).toArray()
  console.log('待迁移用户数:', users.length)

  // 用旧密钥解出每个人的明文密码；任何一个失败就整体中止，避免部分迁移
  const plainById = new Map()
  for (const u of users) {
    if (!u.password) throw new Error(`用户 ${u.username} 没有密码字段`)
    // 与 core/util/util.js 的 decrypt() 一致：两层都用 utf8 输出，
    // 第一层解出 base64 内层密文，第二层解出明文
    const plain = rsa(oldPri).decrypt(rsa(oldPri).decrypt(u.password, 'utf8'), 'utf8')
    if (!plain) throw new Error(`用户 ${u.username} 解密结果为空`)
    plainById.set(String(u._id), plain)
    console.log(`  解密成功: ${u.username}`)
  }

  // 生成新密钥
  const { publicKey: newPub, privateKey: newPri } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  console.log('新密钥位数:', rsa(newPub).getKeySize())

  // 预演：先用新密钥在内存里把所有人都加密一遍，全部成功才落盘
  const newCipherById = new Map()
  for (const [id, plain] of plainById) {
    const inner = rsa(newPub).encrypt(plain, 'base64')
    const outer = rsa(newPub).encrypt(inner, 'base64')
    // 自检：用新私钥按同样的两层顺序解回来，能还原明文才算成功
    const back = rsa(newPri).decrypt(rsa(newPri).decrypt(outer, 'utf8'), 'utf8')
    if (back !== plain) throw new Error(`用户 ${id} 重加密自检失败`)
    newCipherById.set(id, outer)
  }
  console.log('全部用户重加密自检通过')

  const keyDoc = await db.collection('keys').findOne()

  if (DRY) {
    console.log('\n[dry] 未写入任何文件或数据库')
    await mongoose.disconnect()
    return
  }

  // 备份
  const backupDir = path.join(os.tmpdir(), 'blog-key-migrate-' + Date.now())
  fs.mkdirSync(backupDir, { recursive: true })
  fs.copyFileSync(PUB, path.join(backupDir, 'public.cer.bak'))
  fs.copyFileSync(PRI, path.join(backupDir, 'private.cer.bak'))
  fs.writeFileSync(path.join(backupDir, 'users.json'), JSON.stringify(users, null, 2))
  if (keyDoc) fs.writeFileSync(path.join(backupDir, 'keys.json'), JSON.stringify(keyDoc, null, 2))
  console.log('备份目录:', backupDir)

  // 落盘新密钥
  fs.writeFileSync(PUB, newPub)
  fs.writeFileSync(PRI, newPri)
  console.log('新密钥已写入 auth/')

  // 写回密文
  for (const [id, cipher] of newCipherById) {
    await db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { password: cipher } }
    )
  }
  console.log('已更新用户密文:', newCipherById.size)

  // 更新 Key 集合中的公钥
  if (keyDoc) {
    await db.collection('keys').updateOne({ _id: keyDoc._id }, { $set: { content: newPub } })
    console.log('已更新 Key 集合中的公钥')
  } else {
    console.log('Key 集合为空，未写入（GET /keys 会返回 404）')
  }

  await mongoose.disconnect()
  console.log('\n迁移完成。旧数据备份在:', backupDir)
}

main().catch(async e => {
  console.error('迁移失败:', e.message)
  try { await mongoose.disconnect() } catch (_) {}
  process.exit(1)
})
