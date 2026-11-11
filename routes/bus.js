const express = require('express')
const router = express.Router()
const User = require('../models/User')
const Article = require('../models/Article')
const Column = require('../models/Column')
const Comment = require('../models/Comment')
const createError = require('http-errors')
const assert = require('http-assert')
const qs = require('qs')

const { pagination, escapeRegExp } = require('../core/util/util')

const POPULATE_MAP = require('../plugins/POPULATE_MAP')
const POP_POST_MAP = require('../plugins/POP_POST_MAP')
const POP_GET_MAP = require('../plugins/POP_GET_MAP')
const POP_PUT_MAP = require('../plugins/POP_PUT_MAP')
const RESOURCE_POST_MAP = require('../plugins/RESOURCE_POST_MAP')

// 免鉴权的 GET 只暴露展示字段：强制 select，忽略用户传入的 options，query 仅允许白名单字段
// （否则 options[select]=+password 可读到密码密文，query[email] 可枚举邮箱）
const PUBLIC_VIEW = {
  User: {
    select: 'nikname avatar signature',
    queryKeys: ['nikname']
  }
}


//创建资源
router.post('/', async (req, res,next) => {
  let modelName = req.Model.modelName
  // 用户注册统一走 /admin/register，总线不提供创建用户的入口
  if (modelName === 'User') return next(createError(404))
  try {
    let body = req.body
    if(modelName in RESOURCE_POST_MAP){
      body = RESOURCE_POST_MAP[modelName]['body'](body,req._id)
    }
    const result = await req.Model.create(body)
    if (modelName in POP_POST_MAP) {
      let item = POP_POST_MAP[modelName]
      let {_refId,_model,queryAct,options} = item
      let _id = result._id
      let refId = result?.[_refId]
      assert(refId, 422, `${_refId} 必填`)
      await _model[queryAct](refId,options(_id))
    }
    res.send(200, {
      message: '提交成功',
      data: {
        id: result._id
      }
    })
  } catch (err) {
    next(err || createError(400,'添加失败'))
  }
})

//更新资源
// /api/rest/articles/83827123/query?..
router.put('/:id', async (req, res, next) => {
  let putData = req.body
  let modelName = req.Model.modelName
  let id = req.params.id //资源id
  let isPass = req.isPass //鉴权结果
  let userId = req._id //userID

  // 用户资料只通过 PUT /user 修改（需校验旧密码），总线不提供该入口
  if (modelName === 'User') return next(createError(404))

  try{
    let { revisable,authField } = POP_PUT_MAP[modelName]
    let isValidate = (modelName in POP_PUT_MAP) && isPass
    assert(isValidate,400,"无权修改")
    let data = await req.Model.findById(id)
    assert(data,404,"资源不存在")
    assert.equal(userId,data?.[authField],400,'无权修改') 
    
    let updateData = Object.entries(putData).filter(([key,value])=>{  
      return revisable.includes(key)
    }) 
    isValidate = updateData.length !== 0
    assert(isValidate,400,'修改失败')
    updateData = Object.fromEntries(updateData)
    updateData['date'] = new Date().toISOString()
    await req.Model.findByIdAndUpdate(id, updateData)
    res.send(200, {
        message: '修改成功'
    })
  }catch(err){
    console.log(err.message,'123')

    next(err)
  }
})

//删除资源（仅作者可删，同步清理关联引用）
router.delete('/:id', async (req, res, next) => {
  let modelName = req.Model.modelName
  let id = req.params.id
  let isPass = req.isPass
  let userId = req._id
  // 用户不允许通过总线删除，总线不提供该入口
  if (modelName === 'User') return next(createError(404))
  try {
    // 未在 POP_PUT_MAP 中声明的模型同样拒绝
    assert(isPass && modelName in POP_PUT_MAP, 403, '无权删除')
    let { authField } = POP_PUT_MAP[modelName]
    let data = await req.Model.findById(id)
    assert(data, 404, '资源不存在')
    assert.equal(userId, data[authField], 403, '无权删除')
    await req.Model.findByIdAndDelete(id)
    // 清理父文档中的引用：评论从文章移除并减少 comment_num，文章从专栏移除
    if (modelName === 'Comment') {
      await Article.updateOne({ _id: data.aid, comments: id }, { $pull: { comments: id }, $inc: { comment_num: -1 } })
    }
    if (modelName === 'Article') {
      await Column.updateOne({ _id: data.column }, { $pull: { aids: id } })
    }
    res.send({
      errMsg: 'ok'
    })
  } catch (err) {
    next(err)
  }
})

//查询资源列表
router.get('/', async (req, res,next) => {
  let modelName = req.Model.modelName
  let {options = {},page = 1,size = 100,query = {},dis = 8,populate={}} = req.query
 
  query = qs.parse(query)
  if(query.q){
    let regexp = new RegExp(escapeRegExp(query.q), 'i')
    query = {
      $or: [
        { title: { $regex: regexp } },
        { content: { $regex: regexp } }
      ]
    }
  }
  
  try{
    if(modelName in POPULATE_MAP){
      populate =  POPULATE_MAP[modelName]
    }
    if (modelName in PUBLIC_VIEW) {
      let { select, queryKeys } = PUBLIC_VIEW[modelName]
      options = select
      query = Object.fromEntries(Object.entries(query).filter(([key]) => queryKeys.includes(key)))
    }
    let result = await pagination({model:req.Model,query,options,populate, size, page, dis})
    res.send(200,{
      message:"ok",
      data:result
    })
  }catch(err){
    console.log(err)
    next(createError(422,"获取失败"))
  }
})

//查询资源详情
router.get('/:id', async (req, res, next) => {
  let modelName = req.Model.modelName
  let _id = req.params.id
  try{
    let query = req.Model.findById(_id)
    if(modelName in PUBLIC_VIEW){
      query = query.select(PUBLIC_VIEW[modelName].select)
    }
    if(modelName in POPULATE_MAP){
      query = query.populate(POPULATE_MAP[modelName])
    }
    let result = await query.exec()
    assert(result, 404, '资源不存在')
    res.send(200, {
        message: '查询成功',
        data: result
    })
    //通过ID查看资源的联动操作（异步执行，不阻塞响应）
    if(modelName in POP_GET_MAP){
      let {queryAct,options} = POP_GET_MAP[modelName]
      req.Model[queryAct](_id,options()).catch(err => console.log(err))
    }

  }catch(err){
    next(err)
  }

})


module.exports = router


/*
  响应

  response

  成功:
     GET: 200 OK
     POST: 201 Created
     PUT: 200 OK
     PATCH: 200 OK
     DELETE: 204 No Content

    获取多条
    {
      message: 'ok',
      data:{
        count: 返回条目数量
        list:[ //请求列表
          {},{},{}
        ]
      }
    }
    单条数据
    {
      message: 'ok',
      data: {数据内容}
    }
    操作反馈 更新 添加
    {
       message: '用户注册成功|数据更新成功|文章提交成功',
    }

  错误
    statusCode
    400: 请求参数错误 请求路径错误
    401: jwt验证未通过 账号面错误
    403: 无权访问 权限不够
    404: 访问资源不存在 resource img file
    422: 用户不存在 密码错误 token过期

    {
      message:"响应错误文本"
    }
*/


  /*
    setOptions
      new：bool-如果返回修改后的文档而不是原始文档，则为true。默认为false
      upsert：bool-创建对象（如果不存在）。默认为false。
      runValidators：如果为true，则对此命令运行更新验证程序。更新验证器根据模型的架构验证更新操作。
      setDefaultsOnInsert：如果upsert为true，则在创建新文档时，猫鼬将应用模型模式中指定的默认值。此选项仅在MongoDB> = 2.4上有效，因为它依赖于MongoDB的$setOnInsertoperator。
      sort：如果条件找到多个文档，请设置排序顺序以选择要更新的文档
      select：设置要返回的文档字段
      rawResult：如果为true，则返回MongoDB驱动程序的原始结果
      strict：覆盖此更新的架构的严格模式选项
  
  */
