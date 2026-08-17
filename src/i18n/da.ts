/**
 * Danish UI strings — the default locale and the source of the key contract.
 *
 * `Messages` is derived from this object, so every other locale must supply
 * exactly these keys. A missing translation is a type error at build time,
 * never a blank string in the interface.
 *
 * Content from faktalink (page titles, video titles, descriptions) is Danish
 * source data and is never translated; it renders as-is in both locales.
 */
export const da = {
  siteName: "Faktalink Video",
  siteTagline: "Se videoerne fra faktalink.dk",

  skipToContent: "Gå til indhold",

  themeToggle: "Skift til mørk eller lys visning",
  themeLight: "Lys",
  themeDark: "Mørk",
  languageLabel: "Sprog",
  languageDanish: "Dansk",
  languageEnglish: "Engelsk",

  homeHeading: "Find videoerne på en faktalink-side",
  homeIntro:
    "faktalink.dk gemmer sine videoer bag en samtykkeboks, der ikke virker for alle. Indsæt adressen her, så får du videoerne — klar til at spille.",

  inputLabel: "Adresse eller emnenavn fra faktalink.dk",
  inputPlaceholder: "1970-erne",
  inputHelp: "Indsæt hele adressen, eller skriv blot emnenavnet.",
  submit: "Vis videoer",
  searching: "Søger",
  clear: "Ryd feltet",

  resultHeading: "Videoer på siden",
  videoOne: "video",
  videoMany: "videoer",
  sourceLink: "Åbn siden på faktalink.dk",
  liveNotice:
    "Siden er hentet direkte fra faktalink.dk, fordi den er nyere end vores seneste opdatering.",

  errorEmpty: "Skriv en adresse eller et emnenavn først.",
  errorNotAUrl: "Det ligner hverken en adresse eller et emnenavn.",
  errorNotAUrlHelp: "Prøv fx 1970-erne eller faktalink.dk/emner/1970-erne.",
  errorWrongHost: "Adressen peger ikke på faktalink.dk.",
  errorWrongHostHelp: "Kopiér adressen fra browserens adresselinje på faktalink.dk.",
  errorNotAnEmne: "Adressen peger ikke på en emneside.",
  errorNotAnEmneHelp: "Emnesider ser sådan ud: faktalink.dk/emner/1970-erne.",
  errorMissingSlug: "Adressen mangler selve emnet.",
  errorMissingSlugHelp: "Tilføj emnenavnet, fx /emner/1970-erne.",
  errorNoVideos: "Der er ingen videoer på den side.",
  errorNoVideosHelp: "Siden findes på faktalink.dk, men den indeholder ingen videoklip.",
  errorNotFound: "Emnet blev ikke fundet.",
  errorNotFoundHelp: "Tjek stavemåden, eller kopiér adressen direkte fra faktalink.dk.",
  errorUnreachable: "Siden kunne ikke hentes lige nu.",
  errorUnreachableHelp:
    "Emnet er nyere end vores seneste opdatering, og det lykkedes ikke at hente det direkte. Prøv igen om lidt.",

  videoPlay: "Afspil",
  videoPlayLabel: "Afspil videoen",
  videoPosterAlt: "Videobillede",
  videoStartsAt: "Starter",
  videoUntitled: "Uden titel",

  playerClose: "Luk",
  playerFallback: "Åbn på YouTube",
  playerBlocked: "Afspilleren kunne ikke indlæses.",
  playerBlockedHelp: "Dit netværk blokerer måske afspilleren. Åbn videoen direkte i stedet.",

  footerSource: "Videoerne hører til faktalink.dk, som krediteres på hver side.",
  notFoundHeading: "Siden findes ikke",
  notFoundIntro: "Adressen fører ingen steder hen. Prøv forsiden i stedet.",
  notFoundLink: "Gå til forsiden",
} as const;

/**
 * The message key contract. Every locale is checked against this, so adding a
 * key to `da` without translating it breaks the build rather than the page.
 */
export type Messages = Record<keyof typeof da, string>;
export type MessageKey = keyof typeof da;
