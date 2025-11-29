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
      name: 'compactDensity',
      type: 'boolean',
      label: '紧凑消息密度'
    },
    {
      name: 'showTimestamps',
      type: 'boolean',
      label: '显示时间戳'
    },
    {
      name: 'fontSize',
      type: 'slider',
      label: '字体大小',
      min: 10,
      max: 18,
      unit: 'px'
    }
  ],
  initialData: settingsStore.display,
  onChange: (_field, _value, data) => {
    settingsStore.updateDisplaySettings(data)
  }
})

</script>

<template>
  <SettingFormContainer header-title="显示设置">
    <template #content>
      <DisplayForm />
    </template>
  </SettingFormContainer>
</template>
