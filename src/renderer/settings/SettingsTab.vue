
<template>
  <li class="tab" @click="$emit('change', ($event.target as HTMLInputElement).checked)">
    <input type="radio" name="tabs" :id="inputId" :aria-label="title" :checked="checked" />
    <label :for="inputId" @click.prevent>
      <slot></slot>
      <span class="title">{{ title }}</span>
    </label>
  </li>
</template>

<script setup lang="ts">

import { v4 as uuidv4 } from 'uuid'
const inputId = uuidv4()

defineProps({
  id: String,
  title: String,
  checked: {
    type: Boolean,
    default: false
  }
})

</script>

