const fs = require('fs');
const qs = require('qs')
const path = require('path');
// node-rsa v2 的 CJS 导出为对象，实际类在 .default 上
const NodeRSA = require('node-rsa').default;

const { priKeyPath, pubKeyPath } = require('../../config');
// const { compile } = require('morgan');
// const mongoPage = require('mongoose-sex-page');
const mongoose = require('mongoose');


function generateKeys() {
  // 2048 位：512 位已可被分解，不足以保护密码
  const newkey = new NodeRSA({ b: 2048 });
  newkey.setOptions({ encryptionScheme: 'pkcs1' })
  let public_key = newkey.exportKey('pkcs8-public')//公钥,
  let private_key = newkey.exportKey('pkcs8-private') //私钥

  fs.writeFileSync(priKeyPath, private_key);
  fs.writeFileSync(pubKeyPath, public_key);


}

function encrypt(plain) {
  let public_key = fs.readFileSync(pubKeyPath, 'utf8');
  const nodersa = new NodeRSA(public_key);
  nodersa.setOptions({ encryptionScheme: 'pkcs1' });
  const encrypted = nodersa.encrypt(plain, 'base64');
  return encrypted;
}

function decrypt(cipher) {
  let private_key = fs.readFileSync(priKeyPath, 'utf8'); //私钥
  let prikey = new NodeRSA(private_key);
  prikey.setOptions({ encryptionScheme: 'pkcs1' });
  return prikey.decrypt(cipher, 'utf8')
}

async function pagination({ model, query, options, populate = {}, size, page, dis }) {
  // if (typeof query === 'string') {
  //   query = qs.parse(query)
  // }
  // let result = await mongoPage(model).find(query).sort({ '_id': -1 }).populate(populate).select(options).size(size).page(page).display(dis).exec()

  // let { total, records: list, pages, display } = result
  // //count 当次返回的 list的长度 数据数量
  // let count = list.length
  // return { count, page, size, total, list, pages, display }

  if (typeof query === 'string') {
    query = qs.parse(query)
  }
  if (!query) query = {}

  // 支持 model 传字符串或 mongoose 模型对象
  const Model = typeof model === 'string' ? mongoose.model(model) : model

  const pageNum = Number(page) || 1
  const sizeNum = Number(size) || 10
  const skip = (pageNum - 1) * sizeNum

  let q = Model.find(query).sort({ '_id': -1 }).skip(skip).limit(sizeNum)
  if (options) q = q.select(options)

  // populate 只在非空时调用，避免 .populate({}) 报错
  if (populate) {
    const isEmptyObj = typeof populate === 'object'
      && !Array.isArray(populate)
      && Object.keys(populate).length === 0
    if (!isEmptyObj) q = q.populate(populate)
  }

  const [list, total] = await Promise.all([
    q.exec(),
    Model.countDocuments(query)
  ])

  const count = list.length
  const pages = Math.ceil(total / sizeNum)

  return { count, page: pageNum, size: sizeNum, total, list, pages, display: dis }
}

function toDouble(num) {
  return String(num)[1] && String(num) || '0' + num;
}

function formatDate(date = new Date(), format = "yyyy-MM-dd hh:mm:ss") {

  let regMap = {
    'y': date.getFullYear(),
    'M': toDouble(date.getMonth() + 1),
    'd': toDouble(date.getDate()),
    'h': toDouble(date.getHours()),
    'm': toDouble(date.getMinutes()),
    's': toDouble(date.getSeconds()),
  }

  //逻辑(正则替换 对应位置替换对应值) 数据(日期验证字符 对应值) 分离
  return Object.entries(regMap).reduce((acc, [reg, value]) => {
    return acc.replace(new RegExp(`${reg}+`, 'g'), value);
  }, format);
}


// 转义正则特殊字符，用于把用户输入当作普通字符串匹配
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  generateKeys,
  encrypt,
  decrypt,
  pagination,
  formatDate,
  escapeRegExp
};