// 漢数字（法令テキスト形式）→ number 変換
// 法令では positional 表記（〇一二三…は各1桁）＋ 、で千区切り ＋ ・で小数点

const KANJI_DIGIT: Record<string, string> = {
  '〇': '0', '一': '1', '二': '2', '三': '3', '四': '4',
  '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
  // 全角アラビア数字
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
};

// 漢数字文字列を整数文字列に変換（位取り方式）
function kanjiDigitsToStr(s: string): string {
  return s.split('').map((c) => KANJI_DIGIT[c] ?? c).join('');
}

// 位取り方式の漢数字文字列 → number
// 例: "一、〇〇〇" → 1000, "一・五〇" → 1.50, "三〇" → 30
export function kanjiToNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // 小数点（・ または ．）
  const dotIdx = s.search(/[・．]/);
  if (dotIdx >= 0) {
    const intPart = s.slice(0, dotIdx).replace(/、/g, '');
    const fracPart = s.slice(dotIdx + 1).replace(/、/g, '');
    const intStr = kanjiDigitsToStr(intPart) || '0';
    const fracStr = kanjiDigitsToStr(fracPart);
    return parseFloat(`${intStr}.${fracStr}`);
  }

  // 千分位区切り（、）
  const parts = s.split('、');
  if (parts.length > 1) {
    let result = 0;
    for (let i = 0; i < parts.length; i++) {
      const power = 3 * (parts.length - 1 - i);
      const digits = parseInt(kanjiDigitsToStr(parts[i]), 10);
      if (isNaN(digits)) return null;
      result += digits * Math.pow(10, power);
    }
    return result;
  }

  // 十・百・千・万を含む伝統的表記（フォールバック）
  if (/[十百千万億]/.test(s)) {
    return parseTraditionalKanji(s);
  }

  // 純 positional
  const arabic = kanjiDigitsToStr(s);
  const n = parseFloat(arabic);
  return isNaN(n) ? null : n;
}

function parseTraditionalKanji(s: string): number | null {
  let result = 0;
  let cur = 0;
  const map: Record<string, number> = {
    '〇': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '十': 10, '百': 100, '千': 1000, '万': 10000, '億': 100000000,
  };
  for (const ch of s) {
    const v = map[ch] ?? (KANJI_DIGIT[ch] ? parseInt(KANJI_DIGIT[ch]) : NaN);
    if (isNaN(v)) return null;
    if (v >= 10) {
      if (v >= 10000) { result = (result + (cur || 1)) * 1; cur = 0; result += (v === 10000 ? 10000 : 100000000) * ((result === 0 && cur === 0) ? 1 : 1); }
      else { result += (cur || 1) * v; cur = 0; }
    } else {
      cur = cur * 10 + v;
    }
  }
  return result + cur;
}
