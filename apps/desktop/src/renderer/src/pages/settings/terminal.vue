<script setup lang="ts">
const settingsStore = useSettingsStore()

const [TerminalForm] = useForm({
  showHeader: true,
  fields: [
    {
      name: 'fontSize',
      type: 'slider',
      label: '字体大小',
      min: 10,
      max: 20,
      unit: 'px'
    },
    {
      name: 'fontFamily',
      type: 'select',
      label: '字体样式',
      options: [
        { value: 'Menlo, Monaco, "Courier New", monospace', label: 'Menlo (默认)' },
        {
          value:
            '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
          label: 'SF Mono'
        },
        {
          value: '"Cascadia Code", "Fira Code", "Roboto Mono", Consolas, "Courier New", monospace',
          label: 'Cascadia Code'
        },
        {
          value: '"Fira Code", "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
          label: 'Fira Code'
        },
        {
          value:
            '"Source Code Pro", "Fira Code", "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
          label: 'Source Code Pro'
        },
        {
          value:
            '"JetBrains Mono", "Fira Code", "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
          label: 'JetBrains Mono'
        },
        { value: 'Consolas, "Courier New", monospace', label: 'Consolas' }
      ]
    },
    {
      name: 'cursorBlink',
      type: 'boolean',
      label: '光标闪烁'
    },
    {
      name: 'backgroundColor',
      type: 'color',
      label: '背景颜色',
      placeholder: '选择终端背景颜色'
    },
    {
      name: 'foregroundColor',
      type: 'color',
      label: '字体颜色',
      placeholder: '选择终端字体颜色'
    },
    {
      name: 'cursorColor',
      type: 'color',
      label: '光标颜色',
      placeholder: '选择终端光标颜色'
    },
    {
      name: 'selectionBackgroundColor',
      type: 'color',
      label: '选中文字背景颜色',
      placeholder: '选择选中文字的背景颜色'
    }
  ],
  initialData: settingsStore.terminal,
  onChange: (_field, _value, data) => {
    settingsStore.updateTerminalSettings(data)
  }
})
</script>

<template>
  <FormContainer header-title="终端设置">
    <template #content>
      <TerminalForm />
    </template>
  </FormContainer>
</template>

<style scoped></style>
