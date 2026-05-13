import { parseStringPromise } from 'xml2js';
import type { RawArticle, RawItem, RawSubitem } from './types';

const EGOV_API_BASE = 'https://laws.e-gov.go.jp/api/1';
// 貨物等省令 法令ID
const LAW_ID = '403M50000400049';

export async function fetchLawXml(): Promise<string> {
  const res = await fetch(`${EGOV_API_BASE}/lawdata/${LAW_ID}`, {
    next: { revalidate: 86400 }, // 24時間キャッシュ
  });
  if (!res.ok) throw new Error(`e-gov API error: ${res.status}`);
  return res.text();
}

// XML全体を取得してパース
export async function fetchAndParseLaw(): Promise<{
  lawTitle: string;
  lawNum: string;
  articles: RawArticle[];
  rawXml: string;
}> {
  const xml = await fetchLawXml();
  const parsed = await parseStringPromise(xml, { explicitArray: true });

  const lawData = parsed?.DataRoot?.ApplData?.[0];
  const lawFullText = lawData?.LawFullText?.[0];
  const law = lawFullText?.Law?.[0];
  const lawBody = law?.LawBody?.[0];
  const mainProvision = lawBody?.MainProvision?.[0];

  const lawTitle = lawBody?.LawTitle?.[0]?._ || lawBody?.LawTitle?.[0] || '不明';
  const lawNum = law?.$?.LawNum || '';

  const allArticles: RawArticle[] = [];

  function collectArticles(node: Record<string, unknown>) {
    for (const article of (node?.Article as unknown[]) || []) {
      allArticles.push(parseArticle(article as Record<string, unknown>));
    }
    for (const child of [
      ...((node?.Chapter as unknown[]) || []),
      ...((node?.Section as unknown[]) || []),
      ...((node?.Division as unknown[]) || []),
      ...((node?.Part as unknown[]) || []),
    ]) {
      collectArticles(child as Record<string, unknown>);
    }
  }

  collectArticles(mainProvision as Record<string, unknown>);

  return { lawTitle, lawNum, articles: allArticles, rawXml: xml };
}

function parseArticle(article: Record<string, unknown>): RawArticle {
  const articleNum = (article?.ArticleTitle as unknown[])?.[0] as string || '';
  const caption = (article?.ArticleCaption as unknown[])?.[0] as string || undefined;
  const paragraphs = (article?.Paragraph as unknown[]) || [];

  const items: RawItem[] = [];
  const rawParagraphs: import('./types').RawParagraph[] = [];

  for (let pi = 0; pi < (paragraphs as unknown[]).length; pi++) {
    const para = (paragraphs as Record<string, unknown>[])[pi];
    const paraItems = (para?.Item as unknown[]) || [];
    for (const item of paraItems as Record<string, unknown>[]) {
      items.push({ ...parseItem(item), paraNum: pi + 1 });
    }
    const paraSentenceNode = (para?.ParagraphSentence as unknown[])?.[0] as Record<string, unknown>;
    const sentences = extractSentences(paraSentenceNode);
    rawParagraphs.push({ paraNum: pi + 1, sentences, hasItems: paraItems.length > 0 });
  }

  return { articleNum, articleCaption: caption, paragraphs: rawParagraphs, items };
}

function parseItem(item: Record<string, unknown>): RawItem {
  const itemNum = (item?.ItemTitle as unknown[])?.[0] as string || '';
  // explicitArray: true により ItemSentence は配列 → [0] で剥がす
  const sentences = extractSentences((item?.ItemSentence as unknown[])?.[0] as Record<string, unknown>);
  const subitems = ((item?.Subitem1 as unknown[]) || []).map(
    (s) => parseSubitem(s as Record<string, unknown>, 1)
  );

  return { paraNum: 1, itemNum, sentences, subitems };
}

function parseSubitem(subitem: Record<string, unknown>, depth: number): RawSubitem {
  const numKey = `Subitem${depth}Title`;
  const sentenceKey = `Subitem${depth}Sentence`;
  const childKey = `Subitem${depth + 1}`;

  const subitemNum = (subitem?.[numKey] as unknown[])?.[0] as string || '';
  const sentences = extractSentences((subitem?.[sentenceKey] as unknown[])?.[0] as Record<string, unknown>);

  const children = depth < 4
    ? ((subitem?.[childKey] as unknown[]) || []).map(
        (c) => parseSubitem(c as Record<string, unknown>, depth + 1)
      )
    : [];

  return { subitemNum, sentences, children };
}

function extractSentences(sentenceNode: Record<string, unknown> | undefined): string[] {
  if (!sentenceNode) return [];
  const sentences = (sentenceNode?.Sentence as unknown[]) || [];
  return sentences.map((s) => {
    if (typeof s === 'string') return s;
    const obj = s as Record<string, unknown>;
    return obj?._ as string || (obj?.Column as unknown[])?.[0] as string || '';
  }).filter(Boolean);
}

// 特定の条を取得（例: "第四条"）
export function getArticleByNum(articles: RawArticle[], num: string): RawArticle | undefined {
  return articles.find((a) => a.articleNum.includes(num));
}

// law_items テーブル用: 号ごとにフラット化したレコードを生成
export interface LawItemRecord {
  articleNum: string;
  itemNum: string;
  itemText: string;    // 号レベルのテキストのみ
  fullText: string;    // 号＋配下のサブ項目テキストを結合
}

function subitemToLines(sub: RawSubitem, indent: string): string[] {
  const lines: string[] = [];
  if (sub.sentences.length > 0) {
    lines.push(`${indent}${sub.subitemNum}: ${sub.sentences.join('')}`);
  }
  for (const child of sub.children) {
    lines.push(...subitemToLines(child, indent + '  '));
  }
  return lines;
}

export function extractLawItemRecords(article: RawArticle): LawItemRecord[] {
  const records: LawItemRecord[] = [];
  const caption = article.articleCaption ? `（${article.articleCaption}）\n` : '';
  const useParaPrefix = article.paragraphs.length > 1 &&
    article.paragraphs.some((p) => p.hasItems);

  for (const para of article.paragraphs) {
    const text = para.sentences.join('');

    if (!para.hasItems) {
      // 号のない項: 本文テキストをそのまま保存（但し書き・例外規定を含む）
      if (text) {
        const itemNum = useParaPrefix ? `第${para.paraNum}項本文` : '本文';
        records.push({
          articleNum: article.articleNum,
          itemNum,
          itemText: text,
          fullText: `【${article.articleNum}】${caption}${itemNum}: ${text}`,
        });
      }
      continue;
    }

    // 号のある項: 号ごとにレコードを生成
    const paraItems = article.items.filter((i) => i.paraNum === para.paraNum);
    for (const item of paraItems) {
      const itemText = item.sentences.join('');
      const qualifiedNum = useParaPrefix
        ? `第${item.paraNum}項第${item.itemNum}号`
        : `第${item.itemNum}号`;
      const lines: string[] = [
        `【${article.articleNum}】${caption}${qualifiedNum}: ${itemText}`,
      ];
      for (const sub of item.subitems) {
        lines.push(...subitemToLines(sub, '  '));
      }
      records.push({
        articleNum: article.articleNum,
        itemNum: qualifiedNum,
        itemText,
        fullText: lines.join('\n'),
      });
    }
  }
  return records;
}

// 条文テキストを人間が読める形式にフラット化（Geminiへの入力用）
export function flattenArticleToText(article: RawArticle): string {
  const lines: string[] = [`【${article.articleNum}】`];
  if (article.articleCaption) lines.push(article.articleCaption);

  for (const item of article.items) {
    lines.push(`  第${item.itemNum}号: ${item.sentences.join('')}`);
    for (const sub of item.subitems) {
      lines.push(`    ${sub.subitemNum}: ${sub.sentences.join('')}`);
      for (const child of sub.children) {
        lines.push(`      ${child.subitemNum}: ${child.sentences.join('')}`);
        for (const grandchild of child.children) {
          lines.push(`        ${grandchild.subitemNum}: ${grandchild.sentences.join('')}`);
        }
      }
    }
  }

  return lines.join('\n');
}
