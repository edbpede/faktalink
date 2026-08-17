<script lang="ts">
  import { type LookupFailure, lookupEmne, resolveEmneInput } from "../lib/lookup";
  import type { EmneResult, ResultSource, VideoProps } from "../lib/types";
  import { buildFaktalinkUrl, buildPosterUrl } from "../lib/urls";
  import { formatTimestamp } from "../lib/utils";

  interface Props {
    locale: "da" | "en";
    /** Site base, so the snapshot resolves correctly under a subpath. */
    base: string;
    labels: {
      inputLabel: string;
      placeholder: string;
      submit: string;
      searching: string;
      help: string;
      resultHeading: string;
      videoOne: string;
      videoMany: string;
      sourceLink: string;
      liveNotice: string;
      play: string;
      playLabel: string;
      posterAlt: string;
      startsAt: string;
      untitled: string;
      clear: string;
      errors: Record<LookupFailure, string>;
      errorHelp: Partial<Record<LookupFailure, string>>;
      modal: {
        close: string;
        fallback: string;
        blocked: string;
        blockedHelp: string;
        untitled: string;
      };
    };
  }

  let { locale, base, labels }: Props = $props();

  /**
   * The fixed part of every faktalink emne address.
   *
   * Rendered as a real prefix inside the field rather than as placeholder text:
   * the reader types or pastes only the part that varies, and the field itself
   * documents the format it expects.
   */
  const ADDRESS_PREFIX = "faktalink.dk/emner/";

  let value = $state("");
  let busy = $state(false);
  let error = $state<LookupFailure | null>(null);
  let result = $state<EmneResult | null>(null);
  let source = $state<ResultSource | null>(null);
  let playing = $state<VideoProps | null>(null);
  let input = $state<HTMLInputElement | null>(null);

  /**
   * The player is loaded on first play, not on page load.
   *
   * Nobody reaches this page with a video already chosen: there is always a
   * lookup first. Deferring the modal keeps its markup, styles and the embed
   * URL builders out of the bundle every reader downloads just to search.
   */
  let VideoModal = $state<typeof import("./VideoModal.svelte").default | null>(null);

  async function play(video: VideoProps) {
    if (VideoModal === null) {
      VideoModal = (await import("./VideoModal.svelte")).default;
    }
    playing = video;
  }

  const hasResult = $derived(result !== null && result.videos.length > 0);
  const marksContent = $derived(locale !== "da");

  /**
   * Strips the address furniture out of a pasted value.
   *
   * Pasting the full address is the single most common action on this page, so
   * it must land as a bare slug in a field that already shows the prefix —
   * otherwise the reader sees `faktalink.dk/emner/https://faktalink.dk/...`.
   */
  function normalise(raw: string): string {
    const resolved = resolveEmneInput(raw);
    if (resolved.ok) return resolved.slug;

    return raw
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/^faktalink\.dk/i, "")
      .replace(/^\/?emner\//i, "")
      .replace(/^\/+/, "");
  }

  function onPaste(event: ClipboardEvent) {
    const pasted = event.clipboardData?.getData("text");
    if (pasted === undefined || pasted === "") return;
    event.preventDefault();
    value = normalise(pasted);
    error = null;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    error = null;
    result = null;
    source = null;
    busy = true;

    try {
      const lookup = await lookupEmne(value, base);
      if (lookup.ok) {
        result = lookup.emne;
        source = lookup.source;
      } else {
        error = lookup.reason;
      }
    } finally {
      busy = false;
    }
  }

  function clear() {
    value = "";
    error = null;
    result = null;
    source = null;
    input?.focus();
  }

  function countLabel(n: number): string {
    return `${n} ${n === 1 ? labels.videoOne : labels.videoMany}`;
  }
</script>

<form class="lookup" onsubmit={submit} novalidate>
  <label class="lookup-label" for="emne-input">
    {labels.inputLabel}
    <!--
      Shown only when the in-field prefix is hidden, so the address format is
      always documented exactly once — never twice, never not at all.
    -->
    <span class="lookup-label-format">{ADDRESS_PREFIX}</span>
  </label>

  <!--
    The field is the page's hero. The prefix is a real element inside the
    control rather than placeholder text, so it stays visible while typing and
    the caret sits exactly where the topic name goes.
  -->
  <div class="lookup-field" class:is-invalid={error !== null && !hasResult}>
    <span class="lookup-prefix" aria-hidden="true">{ADDRESS_PREFIX}</span>

    <input
      bind:this={input}
      bind:value
      id="emne-input"
      name="emne"
      type="text"
      inputmode="url"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      placeholder={labels.placeholder}
      aria-describedby="emne-help"
      aria-invalid={error !== null && !hasResult}
      onpaste={onPaste}
      oninput={() => (error = null)}
    />

    {#if value !== ""}
      <button type="button" class="focus-ring lookup-clear" onclick={clear}>
        <span class="i-lucide-x" aria-hidden="true"></span>
        <span class="sr-only">{labels.clear}</span>
      </button>
    {/if}

    <button type="submit" class="focus-ring lookup-submit" disabled={busy}>
      {#if busy}
        <span class="i-lucide-loader-circle animate-spin" aria-hidden="true"></span>
        <span class="lookup-submit-text">{labels.searching}</span>
      {:else}
        <span class="i-lucide-arrow-right" aria-hidden="true"></span>
        <span class="lookup-submit-text">{labels.submit}</span>
      {/if}
    </button>
  </div>

  <p id="emne-help" class="lookup-help">{labels.help}</p>
</form>

<div class="lookup-output" aria-live="polite">
  {#if error !== null}
    <div class="notice" role="alert">
      <span class="i-lucide-circle-alert notice-icon" aria-hidden="true"></span>
      <div>
        <p class="notice-title">{labels.errors[error]}</p>
        {#if labels.errorHelp[error]}
          <p class="notice-help">{labels.errorHelp[error]}</p>
        {/if}
      </div>
    </div>
  {/if}

  {#if result !== null && hasResult}
    <section class="results">
      <div class="results-head">
        <div>
          <h2 lang={marksContent ? "da" : undefined}>{result.title}</h2>
          <p class="results-count">{countLabel(result.videos.length)}</p>
        </div>

        <a
          class="focus-ring results-source"
          href={buildFaktalinkUrl(result.slug)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="i-lucide-external-link" aria-hidden="true"></span>
          {labels.sourceLink}
        </a>
      </div>

      {#if source === "live"}
        <p class="results-live">{labels.liveNotice}</p>
      {/if}

      <ol class="results-list">
        {#each result.videos as video (video.provider + video.id)}
          {@const title = video.title ?? labels.untitled}
          {@const poster = buildPosterUrl(video.id, video.provider)}
          <li class="reveal">
            <button
              type="button"
              class="focus-ring card"
              onclick={() => play(video)}
              aria-label={`${labels.playLabel}: ${title}`}
            >
              <span class="card-poster">
                {#if poster}
                  <img
                    src={poster}
                    alt=""
                    width="480"
                    height="360"
                    loading="lazy"
                    decoding="async"
                  />
                {:else}
                  <span class="card-poster-empty" aria-hidden="true">
                    <span class="i-lucide-video"></span>
                  </span>
                {/if}
                <span class="card-play">
                  <span class="i-lucide-play" aria-hidden="true"></span>
                  {labels.play}
                </span>
              </span>

              <span class="card-body">
                <span class="card-title" lang={marksContent ? "da" : undefined}>{title}</span>

                {#if video.description}
                  <span class="card-description" lang={marksContent ? "da" : undefined}>
                    {video.description}
                  </span>
                {/if}

                {#if video.startSeconds}
                  <span class="card-meta">
                    {labels.startsAt}
                    {formatTimestamp(video.startSeconds)}
                  </span>
                {/if}
              </span>
            </button>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</div>

{#if VideoModal !== null}
  <VideoModal
    video={playing}
    emneTitle={result?.title ?? ""}
    {locale}
    labels={labels.modal}
    onclose={() => (playing = null)}
  />
{/if}

<style>
  /*
    Scoped styles rather than utilities: the field is the one bespoke control on
    the site, and its prefix/input/submit relationship needs real layout rules
    that would otherwise be an unreadable class string repeated across states.
  */
  .lookup {
    container-type: inline-size;
  }

  .lookup-label {
    display: block;
    margin-bottom: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--muted-foreground);
  }

  .lookup-label-format {
    display: none;
    text-transform: none;
    letter-spacing: -0.01em;
  }

  @container (max-width: 26rem) {
    .lookup-label-format {
      display: block;
      margin-top: 0.25rem;
      color: color-mix(in oklch, var(--muted-foreground) 75%, transparent);
    }
  }

  .lookup-field {
    display: flex;
    align-items: center;
    gap: 0;
    /* Two pixels, not one: at this size a hairline reads as a text box, and
       this field is the page's primary control rather than one field in a form. */
    border: 2px solid var(--foreground);
    border-radius: 0.875rem;
    background: var(--card);
    padding: 0.5rem 0.5rem 0.5rem clamp(0.875rem, 2.5vw, 1.25rem);
    /* An offset shadow rather than a soft drop: the field sits on the page like
       a physical card in a drawer, which is the catalogue metaphor the rest of
       the site is built on. */
    box-shadow: 4px 4px 0 var(--foreground);
    transition:
      box-shadow 0.15s ease,
      transform 0.15s ease,
      border-color 0.15s ease;
  }

  .lookup-field:hover {
    box-shadow: 6px 6px 0 var(--foreground);
    transform: translate(-1px, -1px);
  }

  .lookup-field:focus-within {
    border-color: var(--primary);
    box-shadow: 6px 6px 0 var(--primary);
    transform: translate(-1px, -1px);
  }

  .lookup-field.is-invalid {
    border-color: var(--destructive);
    box-shadow: 4px 4px 0 var(--destructive);
  }

  .lookup-prefix {
    /* Never shrinks: a prefix cut to "faktalink.dk/emn" reads as a rendering
       fault rather than as context. It is either shown whole or not at all,
       and the container query below decides which. */
    flex: 0 0 auto;
    font-family: var(--font-mono);
    /* Deliberately larger than the page heading: the address is the subject of
       this page, so it is set as the largest text on it. */
    font-size: clamp(0.9375rem, 2.6vw, 1.375rem);
    letter-spacing: -0.02em;
    color: color-mix(in oklch, var(--muted-foreground) 80%, transparent);
    user-select: none;
  }

  /*
    Below ~26rem of field width the prefix would take more room than the slug it
    precedes, leaving the reader typing into a sliver. The format is taught by
    the label there instead, and the whole field goes to the input.
  */
  @container (max-width: 26rem) {
    .lookup-prefix {
      display: none;
    }
  }

  .lookup-field input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 0.75rem 0.25rem;
    font-family: var(--font-mono);
    font-size: clamp(0.9375rem, 2.6vw, 1.375rem);
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--foreground);
  }

  .lookup-field input:focus {
    outline: none;
  }

  .lookup-field input::placeholder {
    color: color-mix(in oklch, var(--muted-foreground) 55%, transparent);
    font-weight: 400;
  }

  .lookup-clear {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 999px;
    background: transparent;
    padding: 0.5rem;
    font-size: 1rem;
    color: var(--muted-foreground);
    cursor: pointer;
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .lookup-clear:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .lookup-submit {
    display: inline-flex;
    flex-shrink: 0;
    gap: 0.5rem;
    align-items: center;
    margin-left: 0.375rem;
    border: 0;
    border-radius: 0.5rem;
    background: var(--primary);
    padding: 0.875rem 1.25rem;
    font-family: var(--font-sans);
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--primary-foreground);
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .lookup-submit:hover:not(:disabled) {
    background: color-mix(in oklch, var(--primary) 90%, black);
  }

  .lookup-submit:disabled {
    opacity: 0.7;
    cursor: default;
  }

  /* On a narrow screen the button keeps only its icon, so the field never
     wraps and the address stays on one line. */
  @container (max-width: 30rem) {
    .lookup-submit-text {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .lookup-submit {
      padding: 0.875rem;
    }
  }

  .lookup-help {
    margin: 0.875rem 0 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--muted-foreground);
  }

  .lookup-output:not(:empty) {
    margin-top: 2.5rem;
  }

  .notice {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    border: 1px solid color-mix(in oklch, var(--destructive) 35%, var(--border));
    border-radius: 0.625rem;
    background: color-mix(in oklch, var(--destructive) 6%, var(--card));
    padding: 1rem 1.125rem;
  }

  .notice-icon {
    flex-shrink: 0;
    margin-top: 0.125rem;
    font-size: 1.125rem;
    color: var(--destructive);
  }

  .notice-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 550;
    color: var(--foreground);
  }

  .notice-help {
    margin: 0.375rem 0 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--muted-foreground);
  }

  .results-head {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: baseline;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
  }

  .results-head h2 {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 1.375rem;
    font-weight: 620;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: var(--foreground);
    text-wrap: balance;
  }

  .results-count {
    margin: 0.25rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }

  .results-source {
    display: inline-flex;
    gap: 0.375rem;
    align-items: center;
    border-radius: 0.25rem;
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    text-decoration: none;
    transition: color 0.15s;
  }

  .results-source:hover {
    color: var(--foreground);
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .results-live {
    margin: 1rem 0 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--muted-foreground);
  }

  .results-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .results-list li {
    border-bottom: 1px solid var(--border);
  }

  .results-list li:last-child {
    border-bottom: 0;
  }

  .card {
    display: grid;
    gap: 0.25rem 1.5rem;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    padding: 1.25rem 0;
    text-align: left;
    cursor: pointer;
  }

  @media (min-width: 40rem) {
    .card {
      grid-template-columns: minmax(0, 15rem) minmax(0, 1fr);
      align-items: start;
    }
  }

  .card-poster {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    overflow: hidden;
    background: var(--muted);
    margin-bottom: 0.75rem;
  }

  @media (min-width: 40rem) {
    .card-poster {
      margin-bottom: 0;
    }
  }

  .card-poster img {
    width: 100%;
    height: 100%;
    /* hqdefault is 4:3 with black bars; the scale crops them to a clean 16:9. */
    object-fit: cover;
    transform: scale(1.35);
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .card:hover .card-poster img {
    transform: scale(1.42);
  }

  .card-poster-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 1.5rem;
    color: var(--muted-foreground);
  }

  .card-play {
    position: absolute;
    bottom: 0.625rem;
    left: 0.625rem;
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    border-radius: 999px;
    background: color-mix(in oklch, var(--background) 94%, transparent);
    padding: 0.375rem 0.875rem 0.375rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--foreground);
    backdrop-filter: blur(4px);
    transition: transform 0.2s;
  }

  .card-play .i-lucide-play {
    color: var(--primary);
  }

  .card:hover .card-play {
    transform: translateY(-2px);
  }

  .card-body {
    display: block;
    min-width: 0;
  }

  .card-title {
    display: block;
    font-family: var(--font-sans);
    font-size: 1.0625rem;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: var(--foreground);
    text-wrap: pretty;
  }

  .card-description {
    display: block;
    margin-top: 0.5rem;
    font-family: var(--font-serif);
    font-size: 1rem;
    line-height: 1.55;
    color: var(--muted-foreground);
    text-wrap: pretty;
  }

  .card-meta {
    display: block;
    margin-top: 0.75rem;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
