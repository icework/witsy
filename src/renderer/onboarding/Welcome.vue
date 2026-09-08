
<template>

  <section>

    <header>
      <img class="logo" src="@assets/summon.png" alt="Logo" />
      <h1>{{ t('onboarding.welcome.title') }}</h1>
      <h3>{{ t('onboarding.welcome.subtitle') }}</h3>
    </header>

    <main>

      <div class="feature" :style="{ '--delay': '0s' }">
        <MessageSquareQuoteIcon class="feature-icon" />
        <span class="feature-text">{{ t('common.chat') }}</span>
      </div>

      <div class="feature" :style="{ '--delay': '0.2s' }">
        <TelescopeIcon class="feature-icon" />
        <span class="feature-text">{{ t('common.deepResearch') }}</span>
      </div>

      <div class="feature" :style="{ '--delay': '0.4s' }">
        <PaletteIcon class="feature-icon" />
        <span class="feature-text">{{ t('designStudio.title') }}</span>
      </div>

      <div class="feature" :style="{ '--delay': '0.6s' }">
        <NotebookPenIcon class="feature-icon" />
        <span class="feature-text">{{ t('scratchpad.title') }}</span>
      </div>

      <div class="feature" :style="{ '--delay': '0.8s' }">
        <MicIcon class="feature-icon" />
        <span class="feature-text">{{ t('transcribe.title') }}</span>
      </div>

    </main>

  </section>

</template>

<script setup lang="ts">

import { MessageSquareQuoteIcon, MicIcon, NotebookPenIcon, PaletteIcon, TelescopeIcon } from 'lucide-vue-next'
import { t } from '@services/i18n'

</script>

<style scoped>

section {
  
  align-self: center;
  justify-content: center;

  header {

    .logo {
      width: calc(var(--space-24) * 2);
      height: calc(var(--space-24) * 2);
    }

    h1 {
      padding-top: var(--space-12);
    }

    h3 {
      padding: var(--space-16) var(--space-12) !important;
    }

  }

  main {

    flex: 0 0 auto !important;
    height: auto;
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: flex-start !important;
    justify-content: center;
    overflow: visible !important;
    gap: var(--space-12);

    .feature {
      --delay: 0s;
      display: flex;
      flex-direction: column;
      align-items: center;
      font-size: 1.2rem;
      gap: 1rem;
      min-width: 0;
      text-align: center;
      color: var(--dimmed-text-color);

      .feature-icon {
        width: 2rem;
        height: 2rem;
        transform: translateY(-100vh);
        animation: slideInIcon 0.8s ease-out forwards;
        animation-delay: var(--delay);
      }

      .feature-text {
        opacity: 0;
        transform: translateY(20px);
        animation: fadeInText 0.6s ease-out forwards;
        animation-delay: calc(var(--delay) + 0.4s);
      }
    }

  }

}

@keyframes slideInIcon {
  0% {
    transform: translateY(-100vh) rotate(-180deg);
    opacity: 0;
  }
  60% {
    transform: translateY(10px) rotate(10deg);
    opacity: 1;
  }
  80% {
    transform: translateY(-5px) rotate(-5deg);
  }
  100% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
}

@keyframes fadeInText {
  0% {
    opacity: 0;
    transform: translateY(20px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

</style>