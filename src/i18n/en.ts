import type { Messages } from "./da";

/**
 * English UI strings.
 *
 * Typed as `Messages`, so a key present in Danish but missing here is a
 * compile-time error. Faktalink's own content is never translated.
 */
export const en: Messages = {
  siteName: "Faktalink Video",
  siteTagline: "Watch the videos from faktalink.dk",

  skipToContent: "Skip to content",
  navHome: "Home",
  navBrowse: "All topics",
  navPaste: "Paste page source",

  themeToggle: "Switch between dark and light view",
  themeLight: "Light",
  themeDark: "Dark",
  languageLabel: "Language",
  languageDanish: "Danish",
  languageEnglish: "English",

  homeEyebrow: "Video index for faktalink.dk",
  homeHeading: "Find the videos on a faktalink page",
  homeIntro:
    "faktalink.dk keeps its videos behind a consent box that does not work for everyone. Paste a topic address here to get the videos as a list you can play straight away.",
  homeInputLabel: "Address or topic name from faktalink.dk",
  homeInputPlaceholder: "faktalink.dk/emner/1970-erne",
  homeSubmit: "Show videos",
  homeHelp: "Paste the full address or just the topic name, such as 1970-erne.",
  homeBrowseLink: "See all topics with video",

  statEmner: "topics with video",
  statVideos: "videos in total",
  statCrawled: "topics checked",

  errorEmpty: "Enter an address or a topic name first.",
  errorNotAUrl: "That looks like neither an address nor a topic name. Try 1970-erne.",
  errorWrongHost: "That address does not point to faktalink.dk.",
  errorNotAnEmne: "That address is from faktalink.dk, but it is not a topic page.",
  errorMissingSlug: "The address is missing the topic itself, such as /emner/1970-erne.",
  errorUnknownSlug: "That topic is not in the index.",
  errorUnknownSlugHelp:
    "The index was built at the last update. If the page is newer, paste its source instead.",

  browseEyebrow: "The index",
  browseHeading: "All topics with video",
  browseIntro: "Every topic below has at least one video. Search by title or topic name.",
  browseSearchLabel: "Search topics",
  browseSearchPlaceholder: "Search, e.g. kolde krig",
  browseCount: "topics",
  browseNoMatches: "No topics match that search.",
  browseNoMatchesHelp: "Try a shorter search term, or clear the field.",
  browseClear: "Clear search",
  browseVideoOne: "video",
  browseVideoMany: "videos",

  emneEyebrow: "Topic",
  emneSourceLink: "Open the page on faktalink.dk",
  emneVideoCount: "videos on this page",
  emneVideoCountOne: "video on this page",
  emneEmpty: "There are no videos on this page.",
  emneEmptyHelp: "The page exists on faktalink.dk, but it holds no video clips.",
  emneBackToBrowse: "Back to all topics",

  videoPlay: "Play",
  videoPlayLabel: "Play the video",
  videoFallback: "Open on YouTube",
  videoFallbackHint: "If the player does not work, open the video directly.",
  videoIdLabel: "Video ID",
  videoStartsAt: "Starts at",
  videoUntitled: "Untitled",

  pasteEyebrow: "Newer pages",
  pasteHeading: "Paste the page source",
  pasteIntro:
    "If a topic is newer than the index, you can pull the videos straight from the page source. Nothing is sent anywhere — it all happens in your browser.",
  pasteSteps: "How to do it",
  pasteStep1: "Open the topic page on faktalink.dk.",
  pasteStep2: "Press Ctrl+U to view the source.",
  pasteStep3: "Press Ctrl+A, then Ctrl+C.",
  pasteStep4: "Paste the source into the field below.",
  pasteLabel: "Page source",
  pastePlaceholder: "Paste the whole source here",
  pasteSubmit: "Find videos",
  pasteClear: "Clear the field",
  pasteResultHeading: "Videos found",
  pasteEmptyInput: "Paste the source first.",
  pasteNoVideos: "There are no videos in the pasted source.",
  pasteNoVideosHelp: "The page holds no video clips, or only part of the source was pasted.",
  pasteParseError: "That source could not be read.",
  pasteParseErrorHelp: "Copy the whole source from Ctrl+U — not the text from the page itself.",

  footerSource: "The videos belong to faktalink.dk, which is credited on every topic page.",
  footerBuilt: "Index built",
  notFoundHeading: "Page not found",
  notFoundIntro: "That address leads nowhere. Try the index instead.",
};
