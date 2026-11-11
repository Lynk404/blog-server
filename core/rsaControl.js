const { decrypt, encrypt, generateKeys } = require('../core/util/util')
const fs = require('fs').promises
const fsSync = require('fs')
const { pubKeyPath, priKeyPath, jwtPubKeyPath, jwtPriKeyPath } = require('../config')

module.exports = {
  // JWT 密钥：只读取，不回退到 generateKeys()，文件缺失直接报错，避免覆盖密码密钥
  getJwtPublicKeySync () {
    return fsSync.readFileSync(jwtPubKeyPath, 'utf8')
  },
  async getJwtPrivateKey () {
    return fs.readFile(jwtPriKeyPath, 'utf8')
  },
  getPublicKeySync () {
    return fsSync.readFileSync(pubKeyPath, 'utf8')
  },
  async getPublicKey () {
    let key
    try {
      key = await fs.readFile(pubKeyPath, 'utf8')
    } catch (err) {
      generateKeys()
      key = await fs.readFile(pubKeyPath, 'utf8')
    }
    return key
  },
  async getPrivateKey () {
    let key
    try {
      key = await fs.readFile(priKeyPath, 'utf8')
    } catch (err) {
      generateKeys()
      key = await fs.readFile(priKeyPath, 'utf8')
    }
    return key
  }
}
