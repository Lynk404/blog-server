const { decrypt, encrypt, generateKeys } = require('../core/util/util')
const fs = require('fs').promises
const fsSync = require('fs')
const { pubKeyPath, priKeyPath } = require('../config')
const { getUserStatusMsg } = require('../core/statusControl')
const { getJwtPrivateKey } = require('../core/rsaControl')
const jwt = require('jsonwebtoken') //token生成包  JWT

module.exports = {
  async sendToken (userInfo) {
    let { username, _id } = userInfo


    // 使用 JWT 专用私钥签发（与密码加密密钥分离）
    let privateKey = await getJwtPrivateKey()
    let token = jwt.sign({ username, _id, exp: ~~((Date.now() / 1000) + 24 * 3600 * 3) }, privateKey, { algorithm: 'RS256' });
    return token
  }
}