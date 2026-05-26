<script setup lang="ts">
const settingsStore = useSettingsStore()

const [DisplayForm] = useForm({
  showHeader: true,
  fields: [
    {
      name: 'darkMode',
      type: 'boolean',
      label: '深色模式'
    },
    {
      name: 'fontSize',
      type: 'slider',
      label: '字体大小',
      min: 10,
      max: 30,
      unit: 'px'
    },
    {
      name: 'expandToolsByDefault',
      type: 'boolean',
      label: '默认展开工具'
    },
    {
      name: 'expandThoughtByDefault',
      type: 'boolean',
      label: '默认展开思考内容'
    },
    {
      name: 'collapsePreviousContent',
      type: 'boolean',
      label: '自动折叠历史回复内容'
    },
    {
      name: 'chatCenteredLayout',
      type: 'boolean',
      label: '聊天内容居中显示',
      hint: '使聊天内容在宽屏下保持居中固定宽度，提升阅读体验'
    },
    {
      name: 'notesInputWidthMode',
      type: 'select',
      label: '笔记输入宽度',
      options: [
        { label: '全屏', value: 'full' },
        { label: '适应人体工学', value: 'ergonomic' }
      ],
      required: true
    }
  ],
  initialData: settingsStore.display,
  onChange: (_field, _value, data) => {
    settingsStore.updateDisplaySettings(data)
  }
})

</script>

<template>
  <FormContainer header-title="显示设置">
    <template #content>
      <DisplayForm />
    </template>
  </FormContainer>
</template>

<style scoped>
</style>
