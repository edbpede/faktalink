<script lang="ts">
  interface EmneEntry {
    slug: string;
    title: string;
    videoCount: number;
  }

  interface Props {
    /** The full index, inlined at build time — no fetch, no loading state. */
    entries: EmneEntry[];
    /** Emne route with `:slug` to substitute. */
    emneUrlTemplate: string;
    labels: {
      searchLabel: string;
      placeholder: string;
      count: string;
      noMatches: string;
      noMatchesHelp: string;
      clear: string;
      videoOne: string;
      videoMany: string;
    };
    /** Danish source titles need marking when the UI locale is English. */
    locale: "da" | "en";
  }

  let { entries, emneUrlTemplate, labels, locale }: Props = $props();

  let query = $state("");

  /**
   * Danish folding: a reader typing "kolde krig" should match "Den kolde krig",
   * and one typing "born" should still find "Børn". Normalising both sides
   * keeps the filter forgiving without a search library.
   */
  function fold(value: string): string {
    return value
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  const haystack = $derived(
    entries.map((entry) => ({ entry, key: `${fold(entry.title)} ${fold(entry.slug)}` })),
  );

  const matches = $derived.by(() => {
    const needle = fold(query.trim());
    if (needle === "") return entries;
    const terms = needle.split(/\s+/);
    return haystack
      .filter(({ key }) => terms.every((term) => key.includes(term)))
      .map(({ entry }) => entry);
  });

  const contentLang = "da";
  const marksContent = $derived(locale !== "da");
</script>

<div class="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
  <div class="flex-1">
    <label class="eyebrow mb-2 block" for="emne-filter">{labels.searchLabel}</label>
    <div class="relative">
      <span
        class="i-lucide-search pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
        aria-hidden="true"
      ></span>
      <input
        id="emne-filter"
        type="search"
        bind:value={query}
        placeholder={labels.placeholder}
        autocomplete="off"
        spellcheck="false"
        class="focus-ring w-full rounded-md border border-input bg-card py-2.5 pl-10 pr-3 text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-ring/40"
      />
    </div>
  </div>

  <p class="shrink-0 font-mono text-xs text-muted-foreground" aria-live="polite">
    {matches.length}
    {labels.count}
  </p>
</div>

{#if matches.length === 0}
  <div class="rounded-md border border-dashed border-border px-6 py-14 text-center">
    <p class="m-0 text-base font-medium text-foreground">{labels.noMatches}</p>
    <p class="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{labels.noMatchesHelp}</p>
    <button
      type="button"
      class="focus-ring mt-5 rounded-md border border-border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-accent"
      onclick={() => (query = "")}
    >
      {labels.clear}
    </button>
  </div>
{:else}
  <ul class="m-0 list-none p-0">
    {#each matches as entry (entry.slug)}
      <li class="border-t border-border last:border-b">
        <a
          href={emneUrlTemplate.replace(":slug", entry.slug)}
          class="focus-ring group flex items-baseline justify-between gap-4 py-3.5 no-underline transition-colors hover:bg-accent/50"
        >
          <span class="min-w-0">
            <span
              class="block truncate text-[0.9375rem] font-medium text-foreground"
              lang={marksContent ? contentLang : undefined}
            >
              {entry.title}
            </span>
            <span
              class="mt-0.5 block truncate font-mono text-[0.6875rem] text-muted-foreground/70"
            >
              {entry.slug}
            </span>
          </span>
          <span class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {entry.videoCount}
            <span class="ml-1">
              {entry.videoCount === 1 ? labels.videoOne : labels.videoMany}
            </span>
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}
