<template>
  <div class="tab-content agent-settings">
    <header>
      <div class="title">{{ t('settings.tabs.models') }}</div>
      <button type="button" class="danger" :aria-label="t('common.delete')" @click="onDeleteCustom" v-if="isCustom"><Trash2Icon /></button>
    </header>
    <main>
      <div class="master-detail">
        <div class="md-master">
          <div class="md-master-list">
            <button type="button" class="md-master-list-item" @click="showCreateCustom()">
              <CirclePlusIcon class="logo create" />
              {{ t('settings.engines.custom.create') }}
            </button>
            <button type="button" class="md-master-list-item" v-for="engine in engines" :key="engine.id" :class="{ selected: currentEngine == engine.id }" :aria-pressed="currentEngine === engine.id" :title="engine.label" @click="selectEngine(engine)">
              <EngineLogo :engine="engine.id" :grayscale="true" />
              <span><strong>{{ engine.label }}</strong></span>
            </button>
          </div>
        </div>
        <div class="md-detail">
          <SettingsAzure v-if="currentEngine === 'azure'" ref="engineSettings" @createCustom="showCreateCustom" />
          <ProviderCredentials v-else ref="engineSettings" :engine="currentEngine" :name="engines.find(e => e.id === currentEngine)?.label || currentEngine" />
        </div>
      </div>
      <CreateEngine ref="createEngine" @create="onCreateCustom" />
    </main>
  </div>
</template>

<script setup lang="ts">

import { CirclePlusIcon, Trash2Icon } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import EngineLogo from '@components/EngineLogo.vue'
import Dialog from '@renderer/utils/dialog'
import LlmFactory, { ILlmManager } from '@services/llms/llm'
import CreateEngine from '@screens/CreateEngine.vue'
import { t } from '@services/i18n'
import { store } from '@services/store'
import { CustomEngineConfig } from 'types/config'
import '../../../css/agent-forms.css'
import '../../../css/agent-settings.css'
import ProviderCredentials from '@components/ProviderCredentials.vue'
import SettingsAzure from './SettingsAzure.vue'

type Engine = {
  id: string,
  label: string
}

const llmManager: ILlmManager = LlmFactory.manager(store.config)

const createEngine = ref(null)
const currentEngine= ref<string>(llmManager.getChatEngines()[0])
const engineSettings = ref(null)

const isCustom = computed(() => llmManager.isCustomEngine(currentEngine.value))

const engines = computed(() => {
  const engines = llmManager.getChatEngines().map(id => {
    if (llmManager.isCustomEngine(id)) {
      return {
        id: id,
        label: (store.config.engines[id] as CustomEngineConfig).label || t('nativeModels.unnamed')
      }
    } else {
      return {
        id: id,
        label: {
          anthropic: 'Anthropic',
          azure: 'Azure',
          cerebras: 'Cerebras',
          deepseek: 'DeepSeek',
          google: 'Google',
          groq: 'Groq',
          lmstudio: 'LM Studio',
          meta: 'Meta',
          mistralai: 'Mistral AI',
          ollama: 'Ollama',
          openai: 'OpenAI',
          openrouter: 'OpenRouter',
          xai: 'xAI',
        }[id]
      }
    }
  })

  // add azure after mistralai
  const idx = engines.findIndex(e => e.id == 'mistralai')
  engines.splice(idx + 1, 0, {
    id: 'azure',
    label: 'Azure'
  })

  // done
  return engines
})

const selectEngine = (engine: Engine) => {
  currentEngine.value = engine.id
  nextTick(() => engineSettings.value.load())
}

const showCreateCustom = (apiSpec?: string) => {
  createEngine.value.show(apiSpec || (currentEngine.value === 'azure' ? 'azure' : 'openai'))
}

const onCreateCustom = (payload: { label: string, api: string, baseURL: string, apiKey: string, deployment: string, apiVersion: string}) => {
  const uuid = 'c' + crypto.randomUUID().replace(/-/g, '')
  store.config.engines[uuid] = {
    label: payload.label,
    api: payload.api,
    baseURL: payload.baseURL,
    apiKey: payload.apiKey,
    deployment: payload.deployment,
    apiVersion: payload.apiVersion,
    models: { chat: [], image: [] },
    model: { chat: '', image: '' }
  }
  store.saveSettings()
  selectEngine({ id: uuid } as Engine)

}

const onDeleteCustom = () => {
  Dialog.show({
    target: document.querySelector('.settings .plugins'),
    title: t('settings.engines.custom.confirmDelete'),
    text: t('common.confirmation.cannotUndo'),
    confirmButtonText: t('common.delete'),
    showCancelButton: true,
  }).then((result) => {
    if (result.isConfirmed) {
      delete store.config.engines[currentEngine.value]
      selectEngine({ id: llmManager.getChatEngines()[0] } as Engine)
      store.saveSettings()
    }
  })
}

const load = (payload: { engine: string }) => {
  if (payload?.engine) {
    selectEngine({ id: payload.engine } as Engine)
  } else {
    engineSettings.value.load()
  }
}

const save = () => {
}

defineExpose({ load })

</script>

<style scoped>
header button { padding: var(--space-4); }
header button svg { width: var(--icon-md); height: var(--icon-md); }
</style>
