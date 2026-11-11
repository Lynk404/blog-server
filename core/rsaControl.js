const fs = require('fs').promises
const fsSync = require('fs')
const { pubKeyPath, priKeyPath, jwtPubKeyPath, jwtPriKeyPath } = require('../config')

// 两套密钥都只读取，不回退到 generateKeys()：
// 文件缺失时直接抛错，避免悄悄换掉密钥导致已存密码全部无法校验
module.exports = {
  getJwtPublicKeySync () {
    return fsSync.readFileSync(jwtPubKeyPath, 'utf8')
  },
  async getJwtPrivateKey () {
    return fs.readFile(jwtPriKeyPath, 'utf8')
  },
  async getPublicKey () {
    return fs.readFile(pubKeyPath, 'utf8')
  },
  async getPrivateKey () {
    return fs.readFile(priKeyPath, 'utf8')
  }
}
