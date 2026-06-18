import { nanoid as _nanoid } from 'nanoid'

/**
 * 生成唯一 ID
 * @param size ID 长度，默认 21
 */
export const nanoid = (size?: number): string => _nanoid(size)

export type { Nanoid } from 'nanoid'
