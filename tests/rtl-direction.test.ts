import { describe, expect, it } from 'vitest'
import { detectDirection } from '../src/renderer/components/Editor/rtl-plugin'

/**
 * Tests for per-block direction detection.
 *
 * Persian strings are built from explicit codepoints rather than pasted as
 * literals. Arabic yeh and Persian yeh are indistinguishable on screen in many
 * fonts, and an editor that silently normalises one to the other would change
 * what these tests actually assert without changing how they look.
 */

const fa = (...codepoints: number[]): string => String.fromCodePoint(...codepoints)

// نرم - three Persian letters
const PERSIAN_WORD = fa(0x0646, 0x0631, 0x0645)
// یک سند فارسی
const PERSIAN_PHRASE = [
  fa(0x06cc, 0x06a9),
  fa(0x0633, 0x0646, 0x062f),
  fa(0x0641, 0x0627, 0x0631, 0x0633, 0x06cc)
].join(' ')
// שלום - Hebrew, to confirm the range is not Arabic-only
const HEBREW_WORD = String.fromCodePoint(0x05e9, 0x05dc, 0x05d5, 0x05dd)

describe('detectDirection', () => {
  it('detects a purely Persian block', () => {
    expect(detectDirection(PERSIAN_PHRASE)).toBe('rtl')
  })

  it('detects a purely English block', () => {
    expect(detectDirection('This paragraph is written in English.')).toBe('ltr')
  })

  it('detects Hebrew as well as Arabic script', () => {
    expect(detectDirection(HEBREW_WORD)).toBe('rtl')
  })

  it('handles a Persian sentence that opens with a Latin word', () => {
    // The case `dir="auto"` gets wrong: it resolves from the first strong
    // character, sees "D", and renders an otherwise-Persian line left-to-right.
    const text = `Docflow ${PERSIAN_PHRASE} ${PERSIAN_PHRASE}`
    expect(detectDirection(text)).toBe('rtl')
  })

  it('keeps an English sentence containing one Persian word left-to-right', () => {
    const text = `The project is called ${PERSIAN_WORD} and it converts documents offline.`
    expect(detectDirection(text)).toBe('ltr')
  })

  it('resolves a tie in favour of RTL', () => {
    // Equal counts: three Persian letters, three Latin letters.
    expect(detectDirection(`${PERSIAN_WORD} abc`)).toBe('rtl')
  })

  it('returns auto for an empty block', () => {
    expect(detectDirection('')).toBe('auto')
    expect(detectDirection('   ')).toBe('auto')
  })

  it('treats a block with no strong characters as left-to-right', () => {
    // Digits and punctuation carry no direction of their own; LTR is the
    // conventional default and matches the surrounding app chrome.
    expect(detectDirection('12345 — 67.8%')).toBe('ltr')
  })

  it('counts Persian digits as RTL evidence', () => {
    // Persian digits (U+06F0-U+06F9) fall inside the Arabic block, so they do
    // count as RTL evidence - which is correct, a line of Persian numerals
    // belongs in an RTL block.
    const persianDigits = fa(0x06f1, 0x06f2, 0x06f3)
    expect(detectDirection(persianDigits)).toBe('rtl')
  })
})
