import { describe, it, expect } from 'vitest';
import { PropertyPanel } from '../src/components/PropertyPanel.js';

/**
 * Bug fixes in PropertyPanel.js.
 *
 * colorToHex reduces an authored color to the opaque #rrggbb a native
 * <input type=color> swatch can hold. The swatch cannot represent alpha or the
 * 'transparent' keyword, so any value it would distort must return null. A null
 * return is the signal to callers: "the swatch is only a preview, do not write
 * it back over the authored value". The earlier implementation returned a wrong
 * color (or coerced 'transparent' to opaque black), which let the swatch
 * silently destroy the authored rgba/alpha/transparent value.
 *
 * colorToHex is a pure helper, so we call it on the prototype with a bare
 * `this`; the constructor touches the DOM and is not needed here.
 */
const colorToHex = (value) => PropertyPanel.prototype.colorToHex.call({}, value);

describe('PropertyPanel.colorToHex', () => {
  it('returns null for empty / nullish input', () => {
    expect(colorToHex('')).toBe(null);
    expect(colorToHex(null)).toBe(null);
    expect(colorToHex(undefined)).toBe(null);
  });

  it('passes through 6-digit hex (lowercased)', () => {
    expect(colorToHex('#ffffff')).toBe('#ffffff');
    expect(colorToHex('#FF8800')).toBe('#ff8800');
  });

  it('expands 3-digit hex to 6-digit', () => {
    expect(colorToHex('#fff')).toBe('#ffffff');
    expect(colorToHex('#f80')).toBe('#ff8800');
    expect(colorToHex('#000')).toBe('#000000');
  });

  it('expands 4-digit hex (#rgba) and drops the alpha nibble', () => {
    // #f80a -> rgb f80, alpha dropped.
    expect(colorToHex('#f80a')).toBe('#ff8800');
  });

  it('drops alpha from 8-digit hex (#rrggbbaa)', () => {
    expect(colorToHex('#ff880080')).toBe('#ff8800');
    expect(colorToHex('#11223344')).toBe('#112233');
  });

  it('rejects malformed hex lengths', () => {
    expect(colorToHex('#12')).toBe(null);
    expect(colorToHex('#12345')).toBe(null);
    expect(colorToHex('#zzzzzz')).toBe(null);
  });

  it('converts opaque rgb() to hex', () => {
    expect(colorToHex('rgb(255, 136, 0)')).toBe('#ff8800');
    expect(colorToHex('rgb(0,0,0)')).toBe('#000000');
  });

  it('converts fully-opaque rgba() (alpha 1) to hex', () => {
    expect(colorToHex('rgba(255, 136, 0, 1)')).toBe('#ff8800');
  });

  it('returns null for rgba() with partial alpha so authored alpha is preserved', () => {
    // The swatch cannot show alpha; null tells the caller not to clobber it.
    expect(colorToHex('rgba(255, 136, 0, 0.5)')).toBe(null);
    expect(colorToHex('rgba(0, 0, 0, 0)')).toBe(null);
  });

  it('does NOT coerce transparent to black', () => {
    // Regression: 'transparent' previously mapped to '#000000', painting the
    // element opaque black on any swatch touch.
    expect(colorToHex('transparent')).toBe(null);
  });

  it('maps the basic named colors', () => {
    expect(colorToHex('white')).toBe('#ffffff');
    expect(colorToHex('black')).toBe('#000000');
    expect(colorToHex('red')).toBe('#ff0000');
    expect(colorToHex('RED')).toBe('#ff0000');
  });

  it('returns null for unknown named colors rather than guessing', () => {
    expect(colorToHex('rebeccapurple')).toBe(null);
  });
});
