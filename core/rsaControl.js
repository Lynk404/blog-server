const fs = require('fs').promises
const fsSync = require('fs')
const { jwtPubKeyPath, jwtPriKeyPath } = require('../config')

// 两套密钥都只读取，缺失时直接抛错，避免悄悄换掉密钥导致已存密码全部无法校验
// 密码密钥（auth/*.cer）由 core/util/util.js 的 encrypt/decrypt 直接读取，
// 生成命令见 CLAUDE.md 的"命令"一节
module.exports = {
  getJwtPublicKeySync () {
    return fsSync.readFileSync(jwtPubKeyPath, 'utf8')
  },
  async getJwtPrivateKey () {
    return fs.readFile(jwtPriKeyPath, 'utf8')
  }
}
