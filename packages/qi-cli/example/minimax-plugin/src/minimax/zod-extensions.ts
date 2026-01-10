import { z } from 'zod'

declare module 'zod' {
  interface ZodType {
    hidden(): this
  }
}

// @ts-ignore
z.ZodType.prototype.hidden = function () {
  const self = this as any
  // 创建一个新的 schema 实例，并在 _def 中注入 isHidden 标记
  const newSchema = new (self.constructor as any)({
    ...self._def,
    isHidden: true
  })
  return newSchema
}
