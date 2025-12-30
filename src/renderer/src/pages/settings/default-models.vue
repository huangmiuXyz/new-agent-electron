<script setup lang="ts">

const settingsStore = useSettingsStore()
const { defaultModels } = storeToRefs(settingsStore)
const { updateDefaultModels } = settingsStore

const [DefaultModelsForm] = useForm({
    title: '默认模型设置',
    showHeader: false,
    fields: [
        {
            name: 'titleGenerationModel',
            type: 'modelSelector',
            label: '标题生成模型',
            popupPosition: 'bottom'
        },
        {
            name: 'translationModel',
            type: 'modelSelector',
            label: '翻译模型',
            popupPosition: 'bottom'
        },
        {
            name: 'searchModel',
            type: 'modelSelector',
            label: '搜索模型',
            popupPosition: 'bottom'
        }
    ],
    initialData: {
        titleGenerationModel: {
            modelId: defaultModels.value.titleGenerationModelId,
            providerId: defaultModels.value.titleGenerationProviderId
        },
        translationModel: {
            modelId: defaultModels.value.translationModelId,
            providerId: defaultModels.value.translationProviderId
        },
        searchModel: {
            modelId: defaultModels.value.searchModelId,
            providerId: defaultModels.value.searchProviderId
        }
    },
    onChange: (_field, _value, data) => {
        updateDefaultModels({
            titleGenerationModelId: data.titleGenerationModel?.modelId || '',
            titleGenerationProviderId: data.titleGenerationModel?.providerId || '',
            translationModelId: data.translationModel?.modelId || '',
            translationProviderId: data.translationModel?.providerId || '',
            searchModelId: data.searchModel?.modelId || '',
            searchProviderId: data.searchModel?.providerId || ''
        })
    }
})

</script>

<template>
    <FormContainer header-title="默认模型设置">
        <template #content>
            <DefaultModelsForm />
        </template>
    </FormContainer>
</template>

<style scoped>
.current-models-info {
    margin-top: 24px;
    padding: 16px;
    background: var(--bg-hover);
    border-radius: 8px;
    border: 1px solid var(--border-color-light);
}

.current-models-info h3 {
    margin: 0 0 16px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
}

.model-info-item {
    margin-bottom: 16px;
}

.model-info-item:last-child {
    margin-bottom: 0;
}

.model-info-item h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
}

.model-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.model-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
}

.model-id {
    font-size: 11px;
    color: var(--text-tertiary);
    font-family: monospace;
}

.no-model {
    font-size: 12px;
    color: var(--text-tertiary);
    font-style: italic;
}
</style>