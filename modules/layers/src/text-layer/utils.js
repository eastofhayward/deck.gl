// TODO merge with icon-layer/icon-manager
/* global document */
import {log} from '@deck.gl/core';

const MISSING_CHAR_WIDTH = 32;

export function nextPowOfTwo(number) {
  return Math.pow(2, Math.ceil(Math.log2(number)));
}

const AUTO_WRAPPING_DIV_STYLE = 'position: absolute; top: -999999; left: -99999; z-index: 1000;';
const AUTO_WRAPPING_DIV_ID = 'auto-wrapping-div';

/**
 * Generate character mapping table or update from an existing mapping table
 * @param characterSet {Array|Set} new characters
 * @param getFontWidth {Function} function to get width of each character
 * @param fontHeight {Number} height of font
 * @param buffer {Number} buffer surround each character
 * @param maxCanvasWidth {Number} max width of font atlas
 * @param mapping {Object} old mapping table
 * @param xOffset {Number} x position of last character in old mapping table
 * @param yOffset {Number} y position of last character in old mapping table
 * @returns {{
 *   mapping: Object,
 *   xOffset: Number, x position of last character
 *   yOffset: Number, y position of last character in old mapping table
 *   canvasHeight: Number, height of the font atlas canvas, power of 2
 *  }}
 */
export function buildMapping({
  characterSet,
  getFontWidth,
  fontHeight,
  buffer,
  maxCanvasWidth,
  mapping = {},
  xOffset = 0,
  yOffset = 0
}) {
  let row = 0;
  // continue from x position of last character in the old mapping
  let x = xOffset;
  Array.from(characterSet).forEach((char, i) => {
    if (!mapping[char]) {
      // measure texts
      // TODO - use Advanced text metrics when they are adopted:
      // https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics
      const width = getFontWidth(char, i);

      if (x + width + buffer * 2 > maxCanvasWidth) {
        x = 0;
        row++;
      }
      mapping[char] = {
        x: x + buffer,
        y: yOffset + row * (fontHeight + buffer * 2) + buffer,
        width,
        height: fontHeight,
        mask: true
      };
      x += width + buffer * 2;
    }
  });

  const rowHeight = fontHeight + buffer * 2;

  return {
    mapping,
    xOffset: x,
    yOffset: yOffset + row * rowHeight,
    canvasHeight: nextPowOfTwo(yOffset + (row + 1) * rowHeight)
  };
}

export function autoWrapping({
  string,
  lineHeight,
  width,
  wordBreak,
  fontSize,
  fontFamily,
  fontWeight,
  textAlign
}) {
  const characters = Array.from(string);
  const textDiv = document.createElement('div');
  textDiv.id = AUTO_WRAPPING_DIV_ID;
  textDiv.style = `
    ${AUTO_WRAPPING_DIV_STYLE}
    word-break: ${wordBreak};
    lineHeight: ${lineHeight};
    width: ${width}px;
    font-size: ${fontSize}px;
    font-family: ${fontFamily};
    font-weight: ${fontWeight};
    text-align: ${textAlign || 'left'}
  `;

  characters.map(character => {
    const span = document.createElement('span');
    span.innerText = character;
    textDiv.appendChild(span);
  });

  document.body.appendChild(textDiv);
  return textDiv;
}

export function transformRow({row, iconMapping, lineHeight, rowOffsetTop, autoWrappingDiv}) {
  let offsetLeft = 0;
  let rowHeight = 0;

  let characters = Array.from(row);

  characters = characters.map((character, i) => {
    let rect = null;
    let datum = null;
    const frame = iconMapping[character];

    if (frame) {
      if (autoWrappingDiv) {
        const span = autoWrappingDiv.childNodes[i];
        rect = span.getBoundingClientRect();

        datum = {
          text: character,
          offsetTop: rowOffsetTop + rect.top,
          offsetLeft: rect.left
        };

        offsetLeft += rect.width;
        if (i === characters.length - 1) {
          rowHeight = rect ? rect.bottom : 0;
        }
      } else {
        datum = {
          text: character,
          offsetTop: rowOffsetTop,
          offsetLeft
        };

        if (!rowHeight) {
          rowHeight = frame.height * lineHeight;
        }
        offsetLeft += frame.width;
      }
    } else {
      log.warn(`Missing character: ${character}`)();

      datum = {
        text: character,
        offsetTop: rowOffsetTop,
        offsetLeft
      };

      offsetLeft += MISSING_CHAR_WIDTH;
    }

    return datum;
  });

  return {
    characters,
    rowWidth: autoWrappingDiv ? autoWrappingDiv.clientWidth : offsetLeft,
    rowHeight
  };
}

/**
 * Transform a text paragraph to an array of characters, each character contains
 * @param props:
 *   - paragraph {String}
 *   - wordBreak {String} css word-break option
 *   - fontSize {number} css font-size
 *   - width {number} css width of the element
 *   - lineHeight {Number} css line-height
 *   - iconMapping {Object} character mapping table for retrieving a character from font atlas
 *   - transformCharacter {Function} callback to transform a single character
 * @param transformedData {Array} output transformed data array, each datum contains
 *   - text: character
 *   - index: character index in the paragraph
 *   - offsetLeft: x offset in the row,
 *   - offsetTop: y offset in the paragraph
 *   - size: [width, height] size of the paragraph
 *   - rowSize: [rowWidth, rowHeight] size of the row
 *   - len: length of the paragraph
 */
export function transformParagraph(
  {
    paragraph,
    iconMapping,
    transformCharacter,
    // styling
    lineHeight,
    wordBreak,
    fontSize,
    fontFamily,
    fontWeight,
    width,
    textAlign
  },
  transformedData
) {
  if (!paragraph) {
    return;
  }

  const wordBreakEnabled = wordBreak && width;
  const rows = paragraph.split('\n');

  // width and height of the paragraph
  const size = [0, 0];
  let rowOffsetTop = 0;

  rows.filter(row => Boolean(row)).forEach(row => {
    let autoWrappingDiv = null;
    if (wordBreakEnabled) {
      autoWrappingDiv = autoWrapping({
        string: row,
        lineHeight,
        width,
        wordBreak,
        fontSize,
        fontFamily,
        fontWeight,
        textAlign
      });
    }

    const {characters, rowWidth, rowHeight} = transformRow({
      row,
      iconMapping,
      lineHeight,
      width,
      rowOffsetTop,
      autoWrappingDiv
    });

    const rowSize = [rowWidth, rowHeight];

    characters.forEach(datum => {
      datum.size = size;
      datum.rowSize = datum.rowSize || rowSize;

      transformedData.push(transformCharacter(datum));
    });

    rowOffsetTop = rowOffsetTop + rowHeight;
    size[0] = Math.max(size[0], rowWidth);

    if (autoWrappingDiv) {
      autoWrappingDiv.remove();
    }
  });

  // last row
  size[1] = rowOffsetTop;
}
