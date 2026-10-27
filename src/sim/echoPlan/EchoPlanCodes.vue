<template>
  <section class="flex min-w-0 flex-col gap-2 rounded-box border border-base-300 bg-base-100 px-4 py-3 max-sm:px-3" data-test-echo-plan-codes>
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">Your Plan Code</h2>
      <span class="text-xs opacity-60">{{ savedCount ? `${savedCount} saved` : "kept in this browser" }}</span>
    </div>
    <div class="flex flex-wrap gap-1" role="tablist" aria-label="Server">
      <button
        v-for="s in SERVERS"
        :key="s.id"
        type="button"
        role="tab"
        class="btn btn-xs"
        :class="s.id === server ? 'btn-primary' : 'btn-ghost border-base-300'"
        :aria-selected="s.id === server"
        :data-test-echo-plan-server="s.id"
        @click="emit('server', s.id)">
        {{ s.label }}<span v-if="codes[s.id]" class="ml-0.5 opacity-70" aria-label="(saved)">•</span>
      </button>
    </div>
    <div class="join w-full">
      <input
        :value="codes[server] ?? ''"
        type="text"
        inputmode="text"
        autocomplete="off"
        spellcheck="false"
        maxlength="64"
        class="input input-bordered input-sm join-item min-w-0 flex-1 font-mono"
        :placeholder="`Paste your ${serverLabel} code`"
        :aria-label="`Plan Code for ${serverLabel}`"
        data-test-echo-plan-code
        @input="emit('code', server, ($event.target as HTMLInputElement).value)" />
      <button
        type="button"
        class="btn btn-sm join-item"
        :disabled="!codes[server]"
        data-test-echo-plan-code-copy
        @click="copy">
        Copy
      </button>
    </div>
    <p class="text-xs leading-snug opacity-65">
      <template v-if="codes[server] && !looksLikePlanCode(codes[server]!)">
        <span class="font-semibold">Shared codes are usually 20 letters and digits — check this one was copied whole.</span>
      </template>
      <template v-else>
        Plan Codes live on Kuro's servers: WT+ can't make or read one. Set the plan in game, share it there, and keep your
        code here to import it on another device.
      </template>
    </p>
  </section>
</template>

<script setup lang="ts">
// Wuthering Tools+ /echo-plan — the player's own Plan Code per server. Only the text is kept (localStorage
// `wtplus:echoPlan:v1`); the game issues and resolves codes server-side.
import { computed } from "vue";
import { useToast } from "../../composables/useToast";
import { SERVERS, looksLikePlanCode, type ServerId } from "./storage";

const props = defineProps<{ codes: Partial<Record<ServerId, string>>; server: ServerId }>();
const emit = defineEmits<{ (e: "server", id: ServerId): void; (e: "code", id: ServerId, code: string): void }>();
const { showToast } = useToast();

const serverLabel = computed(() => SERVERS.find((s) => s.id === props.server)?.label ?? props.server);
const savedCount = computed(() => Object.values(props.codes).filter(Boolean).length);

async function copy(): Promise<void> {
  const code = props.codes[props.server];
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast(`${serverLabel.value} Plan Code copied`, "success", 2500);
  } catch {
    showToast("Couldn't reach the clipboard — select the code and copy it by hand", "warning");
  }
}
</script>
