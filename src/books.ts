export const BOOK_CODES = [
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
    "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "PSA", "PRO",
    "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
    "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
    "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
    "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
    "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
    "TOB", "JDT", "ESG", "WIS", "SIR", "BAR", "LJE", "S3Y", "SUS", "BEL",
    "1MA", "2MA", "3MA", "4MA", "1ES", "2ES", "MAN", "PS2"
] as const

export type BookCode = (typeof BOOK_CODES)[number]

const BOOK_CODE_SET = new Set<string>(BOOK_CODES)

export function isBookCode(value: string): value is BookCode {
    return BOOK_CODE_SET.has(value.toUpperCase())
}

// BOOK_CODES is in Paratext canon order, so a 1-based Paratext book number
// (e.g. 040 = MAT, 077 = 1MA) indexes it directly.
export function bookCodeFromNumber(bookNumber: number): BookCode | undefined {
    return BOOK_CODES[bookNumber - 1]
}

export function bookNumberFromCode(code: string): number | undefined {
    const index = BOOK_CODES.indexOf(code.toUpperCase() as BookCode)
    return index < 0 ? undefined : index + 1
}
