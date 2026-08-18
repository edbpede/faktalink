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
  let closeButton = $state<HTMLButtonElement | null>(null);

  /**
   * How long the embed is given before the player is called broken.
   *
   * A cold embed routinely takes several seconds: DNS, the redirect to the
   * player, then the player's own bundle. The message used to render
   * unconditionally behind the iframe, so it showed through that entire
   * window: readers were told the player had failed, and the video then
   * appeared on top of the apology a moment later.
   *
   * Eight seconds is far longer than a working embed ever needs, so reaching
   * this timer is itself the evidence that something is wrong. Waiting costs
   * the blocked reader nothing they cannot already act on: the "open on
   * YouTube" link sits under the player from the moment it opens.
   */
  const EMBED_GRACE_MS = 8_000;

  /** Whether the embed is now believed to have failed. */
  let embedBlocked = $state(false);

  /**
   * Withholds the failure message until an embed could not plausibly still be
   * loading.
   *
   * A stopwatch is a blunt signal, and it is deliberately the only one here.
   * The iframe's own `load` event cannot stand in for success: browsers fire
   * it for their own network-error page too, so a blocked host would suppress
   * the very message it needs to show. Probing the host with a separate
   * request tells us the host answered, never that the player rendered — a
   * second signal that still could not decide the question, bought with an
   * extra cross-origin request on every play.
   */
  $effect(() => {
    if (video === null) return;

    embedBlocked = false;

    const timer = setTimeout(() => {
      embedBlocked = true;
    }, EMBED_GRACE_MS);

    return () => clearTimeout(timer);
  });

  /**
   * The native dialog gives us the focus trap, the inert background, the top
   * layer and Esc-to-close for free — all things a div-based overlay has to
   * reimplement badly. `showModal()` is the only way to get them, so the
   * element is driven imperatively from the `video` prop.
   */
  $effect(() => {
    if (dialog === null) return;

    if (video !== null && !dialog.open) {
      dialog.showModal();

      // The embed autoplays, and an autoplaying cross-origin iframe takes
      // focus once it loads. Escape would then go to YouTube's player rather
      // than to this dialog, and the reader could not close it from the
      // keyboard at all.
      //
      // Focus is therefore claimed for the close button both immediately and
      // again after the iframe has had a chance to load, because the frame
      // steals it at a moment we do not control. Focusing an already-focused
      // element is a no-op, so the repeat costs nothing.
      closeButton?.focus();
      const reclaim = [0, 120, 400, 1000].map((delay) =>
        setTimeout(() => {
          // Only reclaim from the iframe, never from a control the reader
          // has deliberately tabbed to.
          if (document.activeElement?.tagName === "IFRAME") closeButton?.focus();
        }, delay),
      );
      return () => reclaim.forEach(clearTimeout);
    }

    if (video === null && dialog.open) dialog.close();
  });

  /** Danish source content inside an English page needs its own lang attribute. */
  const marksContent = $derived(locale !== "da");

  /**
   * A click outside the video closes the player.
   *
   * The panel fills the dialog so the layout can centre the player, which means
   * a click never reaches the dialog element itself and testing for it would
   * make this handler dead code. The test is instead whether the click landed
   * on the panel's own padding rather than on anything inside it.
   */
  function onSurfaceClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target === null) return;
    if (target === dialog || target.classList.contains("player-panel")) onclose();
  }
</script>

<dialog
  bind:this={dialog}
  class="player-dialog"
  aria-label={video?.title ?? labels.untitled}
  {onclose}
>
  {#if video}
    <!--
      The click target for "dismiss": the panel is the full-viewport surface
      around the player. A keyboard user has Escape and the close button, so
      this needs no key handler of its own.
    -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="player-panel" onclick={onSurfaceClick}>
      <div class="player-frame">
        <iframe
          src={buildEmbedUrl(video.id, video.provider, video.startSeconds)}
          title={video.title ?? labels.untitled}
          referrerpolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowfullscreen
        ></iframe>

        <!--
          Sits behind the iframe, and only once the embed has had time to load.
          If the embed host is blocked by a DNS filter — the exact situation
          this site exists for — the iframe paints nothing and this shows
          through with a way out. Rendering it unconditionally meant it also
          showed through during a perfectly normal load, so the reader was told
          the player was broken seconds before the video appeared.
        -->
        {#if embedBlocked}
          <p class="player-blocked">
            <span class="player-blocked-title">{labels.blocked}</span>
            <span>{labels.blockedHelp}</span>
          </p>
        {/if}
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

          <button
            bind:this={closeButton}
            type="button"
            class="focus-ring player-close"
            onclick={onclose}
          >
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
