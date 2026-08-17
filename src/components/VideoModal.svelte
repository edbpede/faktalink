<script lang="ts">
  import type { VideoProps } from "../lib/types";
  import { buildEmbedUrl, buildWatchUrl } from "../lib/urls";

  interface Props {
    /** The video to play, or null when the player is closed. */
    video: VideoProps | null;
    /** The page the video came from, shown as attribution. */
    emneTitle: string;
    locale: "da" | "en";
    labels: {
      close: string;
      fallback: string;
      blocked: string;
      blockedHelp: string;
      untitled: string;
    };
    onclose: () => void;
  }

  let { video, emneTitle, locale, labels, onclose }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);

  /**
   * The native dialog gives us the focus trap, the inert background, the top
   * layer and Esc-to-close for free — all things a div-based overlay has to
   * reimplement badly. `showModal()` is the only way to get them, so the
   * element is driven imperatively from the `video` prop.
   */
  $effect(() => {
    if (dialog === null) return;
    if (video !== null && !dialog.open) dialog.showModal();
    if (video === null && dialog.open) dialog.close();
  });

  /** Danish source content inside an English page needs its own lang attribute. */
  const marksContent = $derived(locale !== "da");

  /**
   * A click on the backdrop closes. The dialog element is the backdrop, so a
   * click landing on the element itself — rather than on the panel inside it —
   * is a backdrop click.
   */
  function onBackdropClick(event: MouseEvent) {
    if (event.target === dialog) onclose();
  }
</script>

<dialog
  bind:this={dialog}
  class="player-dialog"
  aria-label={video?.title ?? labels.untitled}
  {onclose}
  onclick={onBackdropClick}
>
  {#if video}
    <div class="player-panel">
      <div class="player-frame">
        <iframe
          src={buildEmbedUrl(video.id, video.provider, video.startSeconds)}
          title={video.title ?? labels.untitled}
          referrerpolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowfullscreen
        ></iframe>

        <!--
          Sits behind the iframe. If the embed host is blocked by a DNS filter —
          the exact situation this site exists for — the iframe paints nothing
          and this shows through with a way out.
        -->
        <p class="player-blocked">
          <span class="player-blocked-title">{labels.blocked}</span>
          <span>{labels.blockedHelp}</span>
        </p>
      </div>

      <div class="player-meta">
        <div class="player-titles">
          <h2 lang={marksContent ? "da" : undefined}>{video.title ?? labels.untitled}</h2>
          <p lang={marksContent ? "da" : undefined}>{emneTitle}</p>
        </div>

        <div class="player-actions">
          <a
            class="focus-ring player-link"
            href={buildWatchUrl(video.id, video.provider, video.startSeconds)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="i-lucide-external-link" aria-hidden="true"></span>
            {labels.fallback}
          </a>

          <button type="button" class="focus-ring player-close" onclick={onclose}>
            <span class="i-lucide-x" aria-hidden="true"></span>
            {labels.close}
          </button>
        </div>
      </div>
    </div>
  {/if}
</dialog>

<style>
  /*
    Scoped rather than utilities: ::backdrop cannot be reached from a utility
    class, and the dialog needs real layout rules that would otherwise be a long
    unreadable class string.
  */
  .player-dialog {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--foreground);
    overflow: hidden;
  }

  .player-dialog::backdrop {
    /* Near-opaque, not a light scrim: the room around the video should fall
       away so the player is the only thing left to look at. */
    background: rgb(12 9 7 / 0.92);
    backdrop-filter: blur(4px);
  }

  .player-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: clamp(0.75rem, 3vw, 2.5rem);
  }

  .player-frame {
    position: relative;
    /* The player fills the viewport it is given, capped so a 16:9 video on a
       tall screen does not stretch into letterboxed dead space. */
    width: min(100%, calc((100dvh - 11rem) * 16 / 9));
    aspect-ratio: 16 / 9;
    margin-inline: auto;
    border-radius: 0.5rem;
    overflow: hidden;
    background: #000;
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 0.5);
  }

  .player-frame iframe {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    border: 0;
  }

  .player-blocked {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 2rem;
    text-align: center;
    color: rgb(255 255 255 / 0.75);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .player-blocked-title {
    font-weight: 600;
    color: rgb(255 255 255 / 0.95);
  }

  .player-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 1.5rem;
    align-items: flex-start;
    justify-content: space-between;
    width: min(100%, calc((100dvh - 11rem) * 16 / 9));
    margin-inline: auto;
  }

  .player-titles {
    min-width: 0;
    flex: 1 1 18rem;
  }

  .player-titles h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -0.01em;
    color: rgb(255 255 255 / 0.96);
    text-wrap: pretty;
  }

  .player-titles p {
    margin: 0.25rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgb(255 255 255 / 0.5);
  }

  .player-actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.5rem;
    align-items: center;
  }

  .player-link,
  .player-close {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    border-radius: 0.375rem;
    padding: 0.5rem 0.875rem;
    font-family: var(--font-sans);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .player-link {
    border: 1px solid rgb(255 255 255 / 0.18);
    background: transparent;
    color: rgb(255 255 255 / 0.8);
    text-decoration: none;
  }

  .player-link:hover {
    background: rgb(255 255 255 / 0.08);
    color: #fff;
  }

  .player-close {
    border: 0;
    background: rgb(255 255 255 / 0.94);
    color: #16110d;
  }

  .player-close:hover {
    background: #fff;
  }

  /* The focus ring is drawn on a dark surface here, so it needs its own offset
     colour rather than the page background token. */
  .player-dialog :global(.focus-ring:focus-visible) {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  @media (max-width: 40rem) {
    .player-meta {
      flex-direction: column;
      align-items: stretch;
    }

    .player-actions {
      justify-content: flex-end;
    }
  }
</style>
