const express = require('express');
const router = express.Router();
const assert = require('http-assert');
const multer = require("multer")
const { uploadPath, uploadURL, maxFileSize } = require('../config')
const path = require('path')
const fs = require('fs');
const createError = require('http-errors');

const FILE_TYPE = {
  'user': 'user',
  'article': 'article'
}

const storage = multer.diskStorage({
  //存储位置
  destination (req, res, cb) {
    let fileType = FILE_TYPE[req.params['classify'].trim()] ?? "other";
    const filePath = path.join(uploadPath, fileType)
    fs.existsSync(filePath) || fs.mkdirSync(filePath);
    cb(null, filePath);
  },
  filename (req, file, cb) {
    const { ext, base, name } = path.parse(file.originalname)
    cb(null, name + '_' + Date.now() + ext);
  }
});

// 只允许图片扩展名。未知分类在落盘前拒绝，不会留下残留文件
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSize
  },
  fileFilter (req, file, cb) {
    if (!ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase())) {
      return cb(createError(422, '只允许上传图片文件（jpg/png/gif/webp）'))
    }
    cb(null, true)
  }
})

// 鉴权与分类检查必须放在 multer 之前，否则未授权的请求也会先把文件写入磁盘
// 拒绝请求时删除 multer 已写入磁盘的文件，避免留下垃圾文件
function discardFiles (files = []) {
  files.forEach(f => fs.rmSync(f.path, { force: true }))
}

router.post('/:classify', (req, res, next) => {
  assert(req.isPass, 401, '请先登录')
  assert(Object.prototype.hasOwnProperty.call(FILE_TYPE, req.params.classify), 400, '文件上传分类不正确')
  next()
}, upload.any(), async (req, res, next) => {
  try {
    let fileType = FILE_TYPE[req.params['classify']] ?? ''

    assert(fileType, 400, '文件上传分类不正确')
    let { uid } = req.body
    // 头像只能上传到本人名下：uid 缺失或不等于当前用户时拒绝
    if (fileType === 'user' && String(uid) !== String(req._id)) {
      discardFiles(req.files)
      assert(uid, 422, '用户头像必须指定UID')
      throw createError(403, '无权上传该用户的头像')
    }
    let fileURLS = req.files.map(item => {
      let { destination, filename } = item
      // 用字符串拼接而非 path.join：path.join 在 Windows 下会产出 .\ 前缀
      return `${uploadURL.replace(/\/+$/, '')}/${path.parse(destination).name}/${filename}`
    })
    let resultData = {
      message: "上传成功",
      data: {
        fileURL: fileURLS[0]
      }
    }

    if (fileType === 'article') {
      let data = fileURLS
      resultData = {
        "errno": 0,
        data
      }
    }

    res.status(200).send(resultData)


  } catch (err) {
    next(err)
  }

})


module.exports = router;
