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

  themeToggle: "Switch between dark and light view",
  themeLight: "Light",
  themeDark: "Dark",
  languageLabel: "Language",
  languageDanish: "Danish",
  languageEnglish: "English",

  homeHeading: "Find the videos on a faktalink page",
  homeIntro:
    "faktalink.dk keeps its videos behind a consent box that does not work for everyone. Paste the address here to get the videos — ready to play.",

  inputLabel: "Address or topic name from faktalink.dk",
  inputPlaceholder: "1970-erne",
  inputHelp: "Paste the full address, or just type the topic name.",
  submit: "Show videos",
  searching: "Searching",
  clear: "Clear the field",

  resultHeading: "Videos on the page",
  videoOne: "video",
  videoMany: "videos",
  sourceLink: "Open the page on faktalink.dk",
  liveNotice:
    "This page was fetched straight from faktalink.dk, because it is newer than our last update.",

  errorEmpty: "Enter an address or a topic name first.",
  errorNotAUrl: "That looks like neither an address nor a topic name.",
  errorNotAUrlHelp: "Try 1970-erne, or faktalink.dk/emner/1970-erne.",
  errorWrongHost: "That address does not point to faktalink.dk.",
  errorWrongHostHelp: "Copy the address from your browser's address bar on faktalink.dk.",
  errorNotAnEmne: "That address is not a topic page.",
  errorNotAnEmneHelp: "Topic pages look like this: faktalink.dk/emner/1970-erne.",
  errorMissingSlug: "The address is missing the topic itself.",
  errorMissingSlugHelp: "Add the topic name, such as /emner/1970-erne.",
  errorNoVideos: "There are no videos on that page.",
  errorNoVideosHelp: "The page exists on faktalink.dk, but it holds no video clips.",
  errorNotFound: "That topic was not found.",
  errorNotFoundHelp: "Check the spelling, or copy the address straight from faktalink.dk.",
  errorUnreachable: "That page could not be fetched right now.",
  errorUnreachableHelp:
    "The topic is newer than our last update, and fetching it directly did not work. Try again shortly.",

  videoPlay: "Play",
  videoPlayLabel: "Play the video",
  videoPosterAlt: "Video thumbnail",
  videoStartsAt: "Starts at",
  videoUntitled: "Untitled",

  playerClose: "Close",
  playerFallback: "Open on YouTube",
  playerBlocked: "The player could not load.",
  playerBlockedHelp: "Your network may be blocking it. Open the video directly instead.",

  footerSource: "The videos belong to faktalink.dk, which is credited on every page.",
  notFoundHeading: "Page not found",
  notFoundIntro: "That address leads nowhere. Try the front page instead.",
  notFoundLink: "Go to the front page",
};
