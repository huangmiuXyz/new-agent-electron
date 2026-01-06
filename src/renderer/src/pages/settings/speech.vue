<script setup lang="ts">
const settingsStore = useSettingsStore()

const voices = ref<SpeechSynthesisVoice[]>([])
const updateVoices = () => {
  voices.value = window.speechSynthesis.getVoices()
}
window.speechSynthesis.onvoiceschanged = updateVoices
updateVoices()

const [TTSForm] = useForm({
  showHeader: true,
  fields: computed(() => [
    {
      name: 'enabled',
      type: 'boolean',
      label: '开启实时朗读 (Web Speech API)'
    },
    {
      name: 'voice',
      type: 'select',
      label: '语音',
      options: voices.value.map((v) => ({
        label: `${v.name} (${v.lang})`,
        value: v.name
      })),
      ifShow: (data) => data.enabled
    },
    {
      name: 'rate',
      type: 'slider',
      label: '语速',
      min: 0.5,
      max: 2,
      step: 0.1,
      ifShow: (data) => data.enabled
    },
    {
      name: 'pitch',
      type: 'slider',
      label: '音调',
      min: 0.5,
      max: 2,
      step: 0.1,
      ifShow: (data) => data.enabled
    },
    {
      name: 'volume',
      type: 'slider',
      label: '音量',
      min: 0,
      max: 1,
      step: 0.1,
      ifShow: (data) => data.enabled
    },
    {
      name: 'triggerMode',
      type: 'select',
      label: '朗读触发时机',
      options: [
        { label: '实时 (每句话结束)', value: 'sentence' },
        { label: '每段结束 (换行)', value: 'paragraph' },
        { label: '完全生成后', value: 'complete' }
      ],
      ifShow: (data) => data.enabled
    }
  ]),
  initialData: settingsStore.speech.tts,
  onChange: (_field, _value, data) => {
    settingsStore.updateSpeechSettings({ tts: { ...settingsStore.speech.tts, ...data } })
  }
})

</script>

<template>
  <FormContainer header-title="语音设置">
    <template #content>
      <TTSForm />
    </template>
  </FormContainer>
</template>

<style scoped>
</style>
