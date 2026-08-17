<script lang="ts">
  import { extractFromDocument, NextDataError } from "../lib/extract";
  import type { VideoLabels, VideoProps } from "../lib/types";
  import VideoList from "./VideoList.svelte";

  interface Props {
    locale: "da" | "en";
    labels: {
      label: string;
      placeholder: string;
      submit: string;
      clear: string;
      resultHeading: string;
      emptyInput: string;
      noVideos: string;
      noVideosHelp: string;
      parseError: string;
      parseErrorHelp: string;
      sourceLink: string;
    };
    videoLabels: VideoLabels;
  }

  let { locale, labels, videoLabels }: Props = $props();

  type Outcome =
    | { kind: "idle" }
    | { kind: "empty" }
    | { kind: "error"; detail: string }
    | { kind: "none" }
    | { kind: "ok"; title: string | null; videos: VideoProps[] };

  let source = $state("");
  let outcome = $state<Outcome>({ kind: "idle" });

  /**
   * Parses the pasted source entirely in the browser.
   *
   * DOMParser builds an inert document — no scripts run, no requests are made,
   * nothing leaves the machine — and the result feeds the exact same extractor
   * the build-time crawler uses, so both paths cannot drift apart.
   */
  function parse(event: SubmitEvent) {
    event.preventDefault();

    if (source.trim() === "") {
      outcome = { kind: "empty" };
      return;
    }

    try {
      const doc = new DOMParser().parseFromString(source, "text/html");
      const result = extractFromDocument(doc);

      outcome =
        result.videos.length === 0
          ? { kind: "none" }
          : {
              kind: "ok",
              title: result.title,
              videos: result.videos.map((video) => ({
                id: video.id,
                title: video.title,
                description: video.description,
                startSeconds: video.startSeconds,
              })),
            };
    } catch (cause) {
      outcome = {
        kind: "error",
        detail: cause instanceof NextDataError ? cause.message : String(cause),
      };
    }
  }

  function clear() {
    source = "";
    outcome = { kind: "idle" };
  }
</script>

<form onsubmit={parse}>
  <label class="eyebrow mb-2 block" for="paste-source">{labels.label}</label>
  <textarea
    id="paste-source"
    bind:value={source}
    rows="8"
    placeholder={labels.placeholder}
    spellcheck="false"
    autocomplete="off"
    class="focus-ring w-full resize-y rounded-md border border-input bg-card p-3.5 font-mono text-xs leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/70 hover:border-ring/40"
  ></textarea>

  <div class="mt-3 flex flex-wrap items-center gap-3">
    <button
      type="submit"
      class="focus-ring inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <span class="i-lucide-scan-search text-sm" aria-hidden="true"></span>
      {labels.submit}
    </button>

    {#if source !== ""}
      <button
        type="button"
        onclick={clear}
        class="focus-ring rounded-md border border-border px-3.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:(bg-accent text-foreground)"
      >
        {labels.clear}
      </button>
    {/if}
  </div>
</form>

<div class="mt-8" aria-live="polite">
  {#if outcome.kind === "empty"}
    <p class="m-0 text-sm font-medium text-destructive">{labels.emptyInput}</p>
  {:else if outcome.kind === "error"}
    <div class="rounded-md border border-destructive/30 bg-destructive/5 px-5 py-4">
      <p class="m-0 text-sm font-semibold text-destructive">{labels.parseError}</p>
      <p class="mb-0 mt-1.5 text-sm text-muted-foreground">{labels.parseErrorHelp}</p>
    </div>
  {:else if outcome.kind === "none"}
    <div class="rounded-md border border-dashed border-border px-6 py-12 text-center">
      <p class="m-0 text-base font-medium">{labels.noVideos}</p>
      <p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{labels.noVideosHelp}</p>
    </div>
  {:else if outcome.kind === "ok"}
    <div
      class="mb-5 flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3"
    >
      <h2 class="m-0 text-lg font-semibold tracking-[-0.01em]">
        {labels.resultHeading}
        {#if outcome.title}
          <span class="font-normal text-muted-foreground" lang="da">— {outcome.title}</span>
        {/if}
      </h2>
      <span class="font-mono text-xs text-muted-foreground">{outcome.videos.length}</span>
    </div>
    <VideoList videos={outcome.videos} {locale} labels={videoLabels} />
  {/if}
</div>
