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

  const chapters = mainProvision?.Chapter || [];
  const topLevelArticles = mainProvision?.Article || [];

  const allArticles: RawArticle[] = [];

  // トップレベルの条を処理
  for (const article of topLevelArticles) {
    allArticles.push(parseArticle(article));
  }

  // 章内の条を処理
  for (const chapter of chapters) {
    const articles = chapter?.Article || [];
    for (const article of articles) {
      allArticles.push(parseArticle(article));
    }
  }

  return { lawTitle, lawNum, articles: allArticles, rawXml: xml };
}

function parseArticle(article: Record<string, unknown>): RawArticle {
  const articleNum = (article?.ArticleTitle as unknown[])?.[0] as string || '';
  const caption = (article?.ArticleCaption as unknown[])?.[0] as string || undefined;
  const paragraphs = (article?.Paragraph as unknown[]) || [];

  const items: RawItem[] = [];
  for (const para of paragraphs as Record<string, unknown>[]) {
    const paraItems = (para?.Item as unknown[]) || [];
    for (const item of paraItems as Record<string, unknown>[]) {
      items.push(parseItem(item));
    }
  }

  return { articleNum, articleCaption: caption, items };
}

function parseItem(item: Record<string, unknown>): RawItem {
  const itemNum = (item?.ItemTitle as unknown[])?.[0] as string || '';
  const sentences = extractSentences(item?.ItemSentence as Record<string, unknown>);
  const subitems = ((item?.Subitem1 as unknown[]) || []).map(
    (s) => parseSubitem(s as Record<string, unknown>, 1)
  );

  return { itemNum, sentences, subitems };
}

function parseSubitem(subitem: Record<string, unknown>, depth: number): RawSubitem {
  const numKey = `Subitem${depth}Title`;
  const sentenceKey = `Subitem${depth}Sentence`;
  const childKey = `Subitem${depth + 1}`;

  const subitemNum = (subitem?.[numKey] as unknown[])?.[0] as string || '';
  const sentences = extractSentences(subitem?.[sentenceKey] as Record<string, unknown>);

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
