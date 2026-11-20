/*
 * 把数据库中的图片绝对 URL 改为相对路径，并可选清理旧默认值。
 *
 *   node scripts/update-image-urls.js                 dry-run，只统计
 *   node scripts/update-image-urls.js --apply         实际写库
 *   node scripts/update-image-urls.js --apply --unset-default-avatars
 *   node scripts/update-image-urls.js --apply --unset-default-covers
 *
 * 旧前缀读取 config.legacyUploadURLs（可配置多个），新形式固定为相对路径：
 *   http://127.0.0.1:3000/article/a.jpg -> /article/a.jpg
 * 流程：先 dry-run -> 备份数据库 -> --apply。
 */
const mongoose = require('mongoose')
const { dbURL, legacyUploadURLs } = require('../config')

const APPLY = process.argv.includes('--apply')
const UNSET_DEFAULT_AVATARS = process.argv.includes('--unset-default-avatars')
const UNSET_DEFAULT_COVERS = process.argv.includes('--unset-default-covers')

const NEW = '/'
const OLDS = [...new Set(legacyUploadURLs.map(url => String(url).replace(/\/+$/, '') + '/'))]

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const replaceBase = (value, old) => String(value).split(old).join(NEW)

async function updateField (collection, field, label, old) {
  const filter = { [field]: { $regex: escapeRegex(old) } }
  const total = await collection.countDocuments(filter)
  console.log(`${label}（${old}）: 匹配 ${total} 条`)
  if (!APPLY || total === 0) return

  const cursor = collection.find(filter)
  let updated = 0
  for await (const doc of cursor) {
    const oldValue = doc[field]
    const newValue = replaceBase(oldValue, old)
    if (newValue === oldValue) continue
    // 以旧值作为过滤条件，避免覆盖迁移期间被并发修改的文档
    const result = await collection.updateOne(
      { _id: doc._id, [field]: oldValue },
      { $set: { [field]: newValue } }
    )
    updated += result.modifiedCount
  }
  console.log(`${label}（${old}）: 更新 ${updated} 条`)
}

async function unsetDefault (collection, field, value, label) {
  const total = await collection.countDocuments({ [field]: value })
  console.log(`${label}: 匹配旧默认值 ${total} 条`)
  if (!APPLY || total === 0) return

  const result = await collection.updateMany({ [field]: value }, { $unset: { [field]: '' } })
  console.log(`${label}: 清空 ${result.modifiedCount} 条`)
}

async function main () {
  if (!OLDS.length && !UNSET_DEFAULT_AVATARS && !UNSET_DEFAULT_COVERS) {
    console.log('config.legacyUploadURLs 为空，且未指定默认值清理参数，无需处理')
    return
  }

  console.log(`模式: ${APPLY ? 'APPLY（会写库）' : 'DRY-RUN（只读）'}`)
  console.log(`旧前缀: ${OLDS.join('、') || '(无)'}`)
  console.log(`新地址: 相对路径（${NEW}article/...、${NEW}user/...）`)
  console.log('提示: --apply 前请先备份数据库（mongodump）。')

  await mongoose.connect(dbURL)
  const db = mongoose.connection.db
  const articles = db.collection('articles')
  const users = db.collection('users')

  if (UNSET_DEFAULT_COVERS) {
    for (const old of OLDS) {
      await unsetDefault(articles, 'cover', old + 'article/article-cover.jpg', `默认封面（${old}）`)
    }
  }
  for (const old of OLDS) {
    await updateField(articles, 'cover', '文章封面', old)
    await updateField(articles, 'content', '正文中的图片 URL', old)
  }

  if (UNSET_DEFAULT_AVATARS) {
    for (const old of OLDS) {
      await unsetDefault(users, 'avatar', old + 'images/avatar.png', `默认头像（${old}）`)
    }
  }
  for (const old of OLDS) {
    await updateField(users, 'avatar', '用户头像', old)
  }

  if (!APPLY) console.log('未写入数据库；确认后加 --apply 执行')
  await mongoose.disconnect()
}

main().catch(async err => {
  console.error('更新失败:', err.message)
  try { await mongoose.disconnect() } catch (_) {}
  process.exit(1)
})
