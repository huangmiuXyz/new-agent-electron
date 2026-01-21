export const getFormFields = (
  renderModels: () => any,
  FilterButton: any
): any[] => [
  {
    name: 'apiKey',
    label: 'API Key',
    type: 'text',
    placeholder: '输入你的 Civitai API Key (可选)...',
    hint: '部分高级筛选功能需要 API Key 才能使用。你可以在 Civitai 设置中生成。'
  },
  {
    name: 'query',
    label: '搜索关键词',
    type: 'text',
    placeholder: '输入关键词搜索模型...',
    rest: FilterButton
  },
  {
    name: 'models',
    type: 'custom',
    render: renderModels
  }
]

export const getFilterFormFields = () => [
  {
    name: 'tag',
    label: '标签',
    type: 'text',
    placeholder: '输入标签筛选...'
  },
  {
    name: 'username',
    label: '作者',
    type: 'text',
    placeholder: '输入作者名筛选...'
  },
  {
    name: 'types',
    label: '模型类型',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: 'Checkpoint', value: 'Checkpoint' },
      { label: 'Lora', value: 'LORA' },
      { label: 'LoCon', value: 'LoCon' },
      { label: 'Textual Inversion', value: 'TextualInversion' },
      { label: 'Hypernetwork', value: 'Hypernetwork' },
      { label: 'Aesthetic Gradient', value: 'AestheticGradient' },
      { label: 'Controlnet', value: 'Controlnet' },
      { label: 'Poses', value: 'Poses' }
    ]
  },
  {
    name: 'sort',
    label: '排序',
    type: 'select',
    options: [
      { label: '评分最高', value: 'Highest Rated' },
      { label: '下载最多', value: 'Most Downloaded' },
      { label: '最新', value: 'Newest' },
      { label: '最受欢迎', value: 'Most Liked' },
      { label: '讨论最多', value: 'Most Discussed' }
    ]
  },
  {
    name: 'period',
    label: '时间范围',
    type: 'select',
    options: [
      { label: '全部时间', value: 'AllTime' },
      { label: '今年', value: 'Year' },
      { label: '本月', value: 'Month' },
      { label: '本周', value: 'Week' },
      { label: '今天', value: 'Day' }
    ]
  },
  {
    name: 'rating',
    label: '最低评分',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: '1星+', value: '1' },
      { label: '2星+', value: '2' },
      { label: '3星+', value: '3' },
      { label: '4星+', value: '4' },
      { label: '5星', value: '5' }
    ]
  },
  {
    name: 'favorites',
    label: '仅显示收藏 (需 API Key)',
    type: 'boolean'
  },
  {
    name: 'hidden',
    label: '仅显示隐藏 (需 API Key)',
    type: 'boolean'
  },
  {
    name: 'primaryFileOnly',
    label: '仅显示主要文件',
    type: 'boolean'
  },
  {
    name: 'allowNoCredit',
    label: '允许不署名',
    type: 'boolean'
  },
  {
    name: 'allowDerivatives',
    label: '允许衍生作品',
    type: 'boolean'
  },
  {
    name: 'allowDifferentLicenses',
    label: '允许不同授权',
    type: 'boolean'
  },
  {
    name: 'supportsGeneration',
    label: '支持在线生成',
    type: 'boolean'
  }
]
