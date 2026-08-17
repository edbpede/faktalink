<script lang="ts">
  import type { VideoLabels, VideoProps } from "../lib/types";
  import { buildEmbedUrl, buildPosterUrl, buildWatchUrl } from "../lib/urls";
  import { formatTimestamp } from "../lib/utils";

  interface Props {
    videos: VideoProps[];
    /** UI locale, so Danish source content can be marked when the UI is English. */
    locale: "da" | "en";
    labels: VideoLabels;
  }

  let { videos, locale, labels }: Props = $props();

  /**
   * The id of the video currently playing, or null.
   *
   * One island holds the whole list rather than one island per card: a page with
   * 13 videos then ships one component instance instead of 13, and only one
   * iframe is ever mounted, so playing a second video releases the first.
   */
  let playingId = $state<string | null>(null);

  /** Danish source content inside an English page needs its own lang attribute. */
  const contentLang = "da";
  const marksContent = $derived(locale !== "da");
</script>

<ol class="m-0 list-none space-y-px p-0">
  {#each videos as video (video.id)}
    {@const isPlaying = playingId === video.id}
    {@const title = video.title ?? labels.untitled}
    <li class="reveal border-b border-border last:border-b-0">
      <article
        class="grid gap-x-6 gap-y-4 py-6 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:py-7"
      >
        <div class="relative">
          {#if isPlaying}
            <div class="aspect-video w-full overflow-hidden rounded-md bg-black">
              <iframe
                src={buildEmbedUrl(video.id, video.startSeconds)}
                {title}
                class="h-full w-full border-0"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                allowfullscreen
              ></iframe>
            </div>
          {:else}
            <button
              type="button"
              class="focus-ring group relative block aspect-video w-full overflow-hidden rounded-md border border-border bg-muted p-0"
              onclick={() => (playingId = video.id)}
              aria-label={`${labels.playLabel}: ${title}`}
            >
              <!--
                A real alt, per the brief. The button's aria-label wins the
                accessible-name computation, so this is not announced twice; it
                earns its keep when the thumbnail CDN is blocked or slow.
              -->
              <img
                src={buildPosterUrl(video.id)}
                alt={`${labels.posterAlt}: ${title}`}
                width="480"
                height="360"
                loading="lazy"
                decoding="async"
                class="h-full w-full scale-[1.35] object-cover transition-transform duration-500 group-hover:scale-[1.42]"
              />
              <span
                class="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/0"
              ></span>
              <span
                class="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-background/95 py-1.5 pl-2.5 pr-3.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition-transform duration-200 group-hover:-translate-y-0.5"
              >
                <span class="i-lucide-play text-sm text-primary" aria-hidden="true"></span>
                {labels.play}
              </span>
            </button>
          {/if}
        </div>

        <div class="min-w-0">
          <h3
            class="m-0 text-pretty text-lg font-semibold leading-snug tracking-[-0.01em]"
            lang={marksContent ? contentLang : undefined}
          >
            {title}
          </h3>

          {#if video.description}
            <p
              class="prose-da mb-0 mt-2 text-muted-foreground"
              lang={marksContent ? contentLang : undefined}
            >
              {video.description}
            </p>
          {/if}

          <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={buildWatchUrl(video.id, video.startSeconds)}
              class="focus-ring inline-flex items-center gap-1.5 rounded text-xs font-medium text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:(text-foreground decoration-foreground)"
              rel="noopener noreferrer"
              target="_blank"
              title={labels.fallbackHint}
            >
              <span class="i-lucide-external-link text-xs" aria-hidden="true"></span>
              {labels.fallback}
            </a>

            <span class="font-mono text-[0.6875rem] tracking-tight text-muted-foreground/80">
              <span class="sr-only">{labels.idLabel}:</span>
              {video.id}
            </span>

            {#if video.startSeconds}
              <span class="font-mono text-[0.6875rem] tracking-tight text-muted-foreground/80">
                {labels.startsAt}
                {formatTimestamp(video.startSeconds)}
              </span>
            {/if}
          </div>
        </div>
      </article>
    </li>
  {/each}
</ol>
