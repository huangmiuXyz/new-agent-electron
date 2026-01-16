import { h, VNode } from 'vue'

// 创建国旗SVG图标的工厂函数
const createFlagIcon = (elements: VNode[]): VNode => {
  return h(
    'svg',
    {
      width: '18',
      height: '12',
      viewBox: '0 0 18 12',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg'
    },
    elements
  )
}

// 中文国旗
export const ChinaFlag = createFlagIcon([
  h('rect', { width: '18', height: '12', fill: '#DE2910' }),
  h('path', {
    d: 'M3 2L3.6 3.9H5.4L3.9 5.1L4.5 6.9L3 5.7L1.5 6.9L2.1 5.1L0.6 3.9H2.4L3 2Z',
    fill: '#FFDE00'
  })
])

// 英文国旗
export const UKFlag = createFlagIcon([
  h('rect', { width: '18', height: '12', fill: '#012169' }),
  h('path', {
    d: 'M0 0L18 12M18 0L0 12',
    stroke: '#FFFFFF',
    'stroke-width': '2'
  }),
  h('path', {
    d: 'M0 0L18 12M18 0L0 12',
    stroke: '#C8102E',
    'stroke-width': '1.2'
  }),
  h('rect', { x: '0', y: '5', width: '18', height: '2', fill: '#FFFFFF' }),
  h('rect', { x: '0', y: '5.4', width: '18', height: '1.2', fill: '#C8102E' }),
  h('rect', { x: '8', y: '0', width: '2', height: '12', fill: '#FFFFFF' }),
  h('rect', { x: '8.4', y: '0', width: '1.2', height: '12', fill: '#C8102E' })
])

// 日文国旗
export const JapanFlag = createFlagIcon([
  h('rect', { width: '18', height: '12', fill: '#FFFFFF' }),
  h('circle', { cx: '9', cy: '6', r: '3', fill: '#BC002D' })
])

// 韩文国旗
export const KoreaFlag = createFlagIcon([
  h('rect', { width: '18', height: '12', fill: '#FFFFFF' }),
  h('circle', { cx: '9', cy: '6', r: '3.5', fill: '#CD2E3A' }),
  h('path', {
    d: 'M9 2.5A3.5 3.5 0 0 1 9 9.5A3.5 3.5 0 0 0 9 2.5Z',
    fill: '#0047A0'
  }),
  h('rect', { x: '2', y: '2', width: '1.5', height: '1.5', fill: '#CD2E3A' }),
  h('rect', { x: '2', y: '8.5', width: '1.5', height: '1.5', fill: '#0047A0' }),
  h('rect', { x: '14.5', y: '2', width: '1.5', height: '1.5', fill: '#0047A0' }),
  h('rect', { x: '14.5', y: '8.5', width: '1.5', height: '1.5', fill: '#CD2E3A' })
])

// 法文国旗
export const FranceFlag = createFlagIcon([
  h('rect', { x: '0', y: '0', width: '6', height: '12', fill: '#002395' }),
  h('rect', { x: '6', y: '0', width: '6', height: '12', fill: '#FFFFFF' }),
  h('rect', { x: '12', y: '0', width: '6', height: '12', fill: '#ED2939' })
])

// 德文国旗
export const GermanyFlag = createFlagIcon([
  h('rect', { x: '0', y: '0', width: '18', height: '4', fill: '#000000' }),
  h('rect', { x: '0', y: '4', width: '18', height: '4', fill: '#DD0000' }),
  h('rect', { x: '0', y: '8', width: '18', height: '4', fill: '#FFCE00' })
])

// 西班牙文国旗
export const SpainFlag = createFlagIcon([
  h('rect', { x: '0', y: '0', width: '18', height: '3', fill: '#AA151B' }),
  h('rect', { x: '0', y: '3', width: '18', height: '6', fill: '#F1BF00' }),
  h('rect', { x: '0', y: '9', width: '18', height: '3', fill: '#AA151B' })
])

// 俄文国旗
export const RussiaFlag = createFlagIcon([
  h('rect', { x: '0', y: '0', width: '18', height: '4', fill: '#FFFFFF' }),
  h('rect', { x: '0', y: '4', width: '18', height: '4', fill: '#0039A6' }),
  h('rect', { x: '0', y: '8', width: '18', height: '4', fill: '#D52B1E' })
])

// 自定义语言图标
export const CustomFlag = createFlagIcon([
  h('rect', { width: '18', height: '12', fill: '#E0E0E0' }),
  h('path', {
    d: 'M9 3L12 6L9 9L6 6L9 3Z',
    fill: '#666666'
  }),
  h('circle', { cx: '9', cy: '6', r: '1', fill: '#FFFFFF' })
])

// 获取语言对应的国旗图标
export const getLanguageFlag = (language: string): VNode => {
  const flagMap: Record<string, VNode> = {
    中文: ChinaFlag,
    英文: UKFlag,
    日文: JapanFlag,
    韩文: KoreaFlag,
    法文: FranceFlag,
    德文: GermanyFlag,
    西班牙文: SpainFlag,
    俄文: RussiaFlag,
    custom: CustomFlag
  }

  return flagMap[language] || CustomFlag
}
