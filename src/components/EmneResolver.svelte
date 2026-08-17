<script lang="ts">
  import { resolveEmneInput, type ResolveFailure } from "../lib/resolve-input";

  interface Props {
    /** Where to send the reader once a slug resolves, with `:slug` substituted. */
    emneUrlTemplate: string;
    /** Path of the JSON index, fetched lazily on first submit. */
    indexUrl: string;
    /** Path of the paste-source page, offered when a slug is not in the index. */
    pasteUrl: string;
    labels: {
      inputLabel: string;
      placeholder: string;
      submit: string;
      help: string;
      pasteLink: string;
      errors: Record<ResolveFailure | "unknown-slug", string>;
      unknownSlugHelp: string;
    };
  }

  let { emneUrlTemplate, indexUrl, pasteUrl, labels }: Props = $props();

  let value = $state("");
  let error = $state<string | null>(null);
  let showPasteHint = $state(false);
  let busy = $state(false);

  /** Slugs are fetched once, on the first submit — not on page load. */
  let knownSlugs: Set<string> | null = null;

  async function loadSlugs(): Promise<Set<string> | null> {
    if (knownSlugs !== null) return knownSlugs;
    try {
      const response = await fetch(indexUrl);
      if (!response.ok) return null;
      const entries = (await response.json()) as { slug: string }[];
      knownSlugs = new Set(entries.map((entry) => entry.slug));
      return knownSlugs;
    } catch {
      // Offline or blocked: fall through and navigate anyway. A wrong guess
      // costs a 404, which is better than refusing to move.
      return null;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    showPasteHint = false;

    const resolved = resolveEmneInput(value);
    if (!resolved.ok) {
      error = labels.errors[resolved.reason];
      return;
    }

    busy = true;
    const slugs = await loadSlugs();
    busy = false;

    if (slugs !== null && !slugs.has(resolved.slug)) {
      error = labels.errors["unknown-slug"];
      showPasteHint = true;
      return;
    }

    window.location.href = emneUrlTemplate.replace(":slug", encodeURIComponent(resolved.slug));
  }
</script>

<form onsubmit={submit} novalidate>
  <label class="eyebrow mb-2 block" for="emne-input">{labels.inputLabel}</label>

  <div class="flex flex-col gap-2 sm:flex-row">
    <input
      id="emne-input"
      name="emne"
      type="text"
      bind:value
      placeholder={labels.placeholder}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-invalid={error !== null}
      aria-describedby={error !== null ? "emne-error" : "emne-help"}
      class="focus-ring min-w-0 flex-1 rounded-md border border-input bg-card px-3.5 py-3 font-mono text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-ring/40"
    />
    <button
      type="submit"
      disabled={busy}
      class="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
    >
      {#if busy}
        <span class="i-lucide-loader-circle animate-spin text-sm" aria-hidden="true"></span>
      {:else}
        <span class="i-lucide-arrow-right text-sm" aria-hidden="true"></span>
      {/if}
      {labels.submit}
    </button>
  </div>

  {#if error}
    <p id="emne-error" role="alert" class="mt-3 text-sm font-medium text-destructive">
      {error}
      {#if showPasteHint}
        <span class="block font-normal text-muted-foreground">
          {labels.unknownSlugHelp}
          <a
            href={pasteUrl}
            class="focus-ring rounded underline underline-offset-4 hover:text-foreground"
          >
            {labels.pasteLink}
          </a>
        </span>
      {/if}
    </p>
  {:else}
    <p id="emne-help" class="mt-3 text-sm text-muted-foreground">{labels.help}</p>
  {/if}
</form>
