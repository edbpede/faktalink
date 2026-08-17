<script lang="ts">
  import { onMount } from "svelte";
  import { $theme as themeStore, applyTheme, type Theme, toggleTheme } from "../stores/theme";

  interface Props {
    /** Accessible label, supplied by the page in the active locale. */
    label: string;
    lightLabel: string;
    darkLabel: string;
  }

  let { label, lightLabel, darkLabel }: Props = $props();

  let current = $state<Theme>("light");
  let mounted = $state(false);

  onMount(() => {
    // The pre-paint script has already applied the class, so the control just
    // needs to reflect the state the page is already in.
    mounted = true;
    // subscribe() fires immediately with the current value, so this both seeds
    // the initial state and keeps every toggle island in step afterwards.
    return themeStore.subscribe((value) => {
      current = value;
      applyTheme(value);
    });
  });

  const isDark = $derived(current === "dark");
</script>

<button
  type="button"
  class="focus-ring inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:(bg-accent text-foreground)"
  onclick={toggleTheme}
  aria-label={label}
  aria-pressed={mounted ? isDark : undefined}
  title={label}
>
  {#if isDark}
    <span class="i-lucide-moon text-sm" aria-hidden="true"></span>
    <span class="hidden sm:inline">{darkLabel}</span>
  {:else}
    <span class="i-lucide-sun text-sm" aria-hidden="true"></span>
    <span class="hidden sm:inline">{lightLabel}</span>
  {/if}
</button>
