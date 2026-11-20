/** Thresholds and limits used by the health rules, the score and the sample questions. Shown on the About page. */
export const RULES = {
  /** "Measures without a description" fires when MORE than this share of visible measures lack one. */
  measureDescriptionShare: 0.2,
  /** "Large wide tables" fires for visible tables with MORE than this many columns. */
  wideTableColumns: 40,
  /** All-caps names are flagged only when they have at least this many letters (so ID, SKU and YTD pass). */
  allCapsMinLetters: 4,
  score: {
    start: 100,
    perWarning: 10,
    warningCap: 50,
    perInfo: 2,
    infoCap: 20,
  },
} as const;

export const QUESTIONS = {
  /** Up to this many numeric measures get sample questions. */
  maxMeasures: 6,
  /** Up to this many text or date columns per measure. */
  maxColumns: 4,
  /** TOPN size in the generated query. */
  topN: 20,
} as const;

/** Row cap for the Try it queries (TOPN keeps them at 20; this is a guard). */
export const TRY_ROW_LIMIT = 100;

/** How many findings the Overview shows. */
export const TOP_FINDINGS = 5;
