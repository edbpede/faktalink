/**
 * Danish UI strings — the default locale and the source of the key contract.
 *
 * `Messages` is derived from this object, so every other locale must supply
 * exactly these keys. A missing translation is a type error at build time,
 * never a blank string in the interface.
 *
 * Content from faktalink (emne titles, video titles, descriptions) is Danish
 * source data and is never translated; it renders as-is in both locales.
 */
export const da = {
  siteName: "Faktalink Video",
  siteTagline: "Se videoerne fra faktalink.dk",

  skipToContent: "Gå til indhold",
  navHome: "Forside",
  navBrowse: "Alle emner",
  navPaste: "Indsæt sidekode",

  themeToggle: "Skift til mørk eller lys visning",
  themeLight: "Lys",
  themeDark: "Mørk",
  languageLabel: "Sprog",
  languageDanish: "Dansk",
  languageEnglish: "Engelsk",

  homeEyebrow: "Videoregister for faktalink.dk",
  homeHeading: "Find videoerne på en faktalink-side",
  homeIntro:
    "faktalink.dk gemmer sine videoer bag en samtykkeboks, der ikke virker for alle. Indsæt en emne-adresse her, så får du videoerne som en liste, du kan afspille med det samme.",
  homeInputLabel: "Adresse eller emnenavn fra faktalink.dk",
  homeInputPlaceholder: "faktalink.dk/emner/1970-erne",
  homeSubmit: "Vis videoer",
  homeHelp: "Du kan indsætte hele adressen eller blot emnenavnet, fx 1970-erne.",
  homeBrowseLink: "Se alle emner med video",

  statEmner: "emner med video",
  statVideos: "videoer i alt",
  statCrawled: "emner gennemgået",

  errorEmpty: "Skriv en adresse eller et emnenavn først.",
  errorNotAUrl: "Det ligner hverken en adresse eller et emnenavn. Prøv fx 1970-erne.",
  errorWrongHost: "Adressen peger ikke på faktalink.dk.",
  errorNotAnEmne: "Adressen er fra faktalink.dk, men den peger ikke på en emneside.",
  errorMissingSlug: "Adressen mangler selve emnet, fx /emner/1970-erne.",
  errorUnknownSlug: "Emnet findes ikke i registeret.",
  errorUnknownSlugHelp:
    "Registeret er bygget ved seneste opdatering. Er siden nyere, kan du indsætte sidens kildekode i stedet.",

  browseEyebrow: "Registeret",
  browseHeading: "Alle emner med video",
  browseIntro: "Hvert emne herunder har mindst én video. Søg efter titel eller emnenavn.",
  browseSearchLabel: "Søg blandt emner",
  browseSearchPlaceholder: "Søg, fx kolde krig",
  browseCount: "emner",
  browseNoMatches: "Ingen emner passer til søgningen.",
  browseNoMatchesHelp: "Prøv et kortere søgeord, eller ryd søgefeltet.",
  browseClear: "Ryd søgning",
  browseVideoOne: "video",
  browseVideoMany: "videoer",

  emneEyebrow: "Emne",
  emneSourceLink: "Åbn siden på faktalink.dk",
  emneVideoCount: "videoer på denne side",
  emneVideoCountOne: "video på denne side",
  emneEmpty: "Der er ingen videoer på denne side.",
  emneEmptyHelp: "Siden findes på faktalink.dk, men den indeholder ingen videoklip.",
  emneBackToBrowse: "Tilbage til alle emner",

  videoPlay: "Afspil",
  videoPlayLabel: "Afspil videoen",
  videoFallback: "Åbn på YouTube",
  videoFallbackHint: "Virker afspilleren ikke, kan du åbne videoen direkte.",
  videoIdLabel: "Video-id",
  videoStartsAt: "Starter",
  videoUntitled: "Uden titel",

  pasteEyebrow: "Nyere sider",
  pasteHeading: "Indsæt sidens kildekode",
  pasteIntro:
    "Er emnet nyere end registeret, kan du hente videoerne direkte fra sidens kildekode. Intet sendes videre — alt sker i din browser.",
  pasteSteps: "Sådan gør du",
  pasteStep1: "Åbn emnesiden på faktalink.dk.",
  pasteStep2: "Tryk Ctrl+U for at se kildekoden.",
  pasteStep3: "Tryk Ctrl+A og derefter Ctrl+C.",
  pasteStep4: "Indsæt koden i feltet herunder.",
  pasteLabel: "Sidens kildekode",
  pastePlaceholder: "Indsæt hele kildekoden her",
  pasteSubmit: "Find videoer",
  pasteClear: "Ryd feltet",
  pasteResultHeading: "Fundne videoer",
  pasteEmptyInput: "Indsæt kildekoden først.",
  pasteNoVideos: "Der er ingen videoer i den indsatte kode.",
  pasteNoVideosHelp: "Siden indeholder ingen videoklip, eller kun en del af koden blev indsat.",
  pasteParseError: "Koden kunne ikke læses.",
  pasteParseErrorHelp:
    "Sørg for at kopiere hele kildekoden fra Ctrl+U — ikke teksten fra selve siden.",

  footerSource: "Videoerne hører til faktalink.dk, som også krediteres på hver emneside.",
  footerBuilt: "Registeret er bygget",
  notFoundHeading: "Siden findes ikke",
  notFoundIntro: "Adressen fører ingen steder hen. Prøv registeret i stedet.",
} as const;

/**
 * The message key contract. Every locale is checked against this, so adding a
 * key to `da` without translating it breaks the build rather than the page.
 */
export type Messages = Record<keyof typeof da, string>;
export type MessageKey = keyof typeof da;
