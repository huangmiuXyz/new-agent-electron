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
  ],
  initialData: settingsStore.terminal,
  onChange: (_field, _value, data) => {
    settingsStore.updateTerminalSettings(data)
  }
})
</script>

<template>
  <SettingFormContainer header-title="终端设置">
    <template #content>
      <TerminalForm />
    </template>
  </SettingFormContainer>
</template>

<style scoped></style>
