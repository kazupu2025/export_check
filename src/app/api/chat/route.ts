import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import type { ChatMessage } from '@/lib/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `あなたは日本の安全保障貿易管理（外為法）の該否判定アシスタントです。
ユーザーが輸出したい品目について質問に答えながら、該否判定を行います。

## 参照する法令
以下は「輸出貿易管理令別表第一及び外国為替令別表の規定に基づき貨物又は技術を定める省令」の関連条文です。
この一次ソースに基づいて判定してください。

{LAW_TEXT}

## 進め方
- Phase 1（品目特定）: 製品の種類・形態・用途を確認する質問を2〜3問
- Phase 2（スペック収集）: 規制判定に必要なパラメータを1つずつ質問
- Phase 3（判定）: 全パラメータが揃ったら判定結果と根拠を提示

## 判定結果の提示フォーマット
---
**判定結果: [非該当（許可不要）/ 要人間確認 / 許可必要]**

| パラメータ | 入力値 | 規制閾値 | 判定 |
|-----------|-------|---------|-----|
| 例: 比弾性率 | 入力値 | 閾値 | 未満/超過 |

**根拠条文**: [条・号の原文を引用]
**次のアクション**: [具体的な手順]
---

## 重要な原則
- スペック未入力は「非該当」ではなく「要確認」とする
- 判定の最終責任は担当者にある旨を必ず伝える
- 「要確認」「許可必要」の場合はCISTECへの確認を推奨する
- 関連条文が見当たらない品目はキャッチオール規制の観点から「要確認」とする`;

// ユーザーの発言からキーワードを抽出して関連条文を検索
async function fetchRelevantLawItems(userText: string): Promise<string> {
  const db = createServerClient();

  // 直近のユーザー発言からキーワードで全文検索
  const keywords = userText
    .replace(/[、。！？\s]+/g, ' ')
    .trim()
    .slice(0, 200);

  const { data: items } = await db
    .from('law_items')
    .select('article_num, item_num, full_text')
    .textSearch('full_text', keywords.split(' ').filter(Boolean).slice(0, 5).join(' | '), {
      type: 'plain',
    })
    .limit(20);

  if (!items || items.length === 0) {
    // キーワード検索で見つからない場合は全件から先頭を返す（フォールバック）
    const { data: fallback } = await db
      .from('law_items')
      .select('article_num, item_num, full_text')
      .limit(30);
    return fallback?.map((i) => i.full_text).join('\n\n') ?? '（条文データなし）';
  }

  return items.map((i) => i.full_text).join('\n\n');
}

// POST /api/chat
export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId } = await req.json() as {
      messages: ChatMessage[];
      sessionId: string;
    };

    // ユーザーの最新発言から関連条文を取得
    const userMessages = messages.filter((m) => m.role === 'user');
    const recentUserText = userMessages.slice(-3).map((m) => m.content).join(' ');
    const lawText = await fetchRelevantLawItems(recentUserText);

    const systemPrompt = SYSTEM_PROMPT.replace('{LAW_TEXT}', lawText);

    const apiMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: apiMessages,
    });

    const assistantMessage = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    const isDone = assistantMessage.includes('判定結果:') ||
                   assistantMessage.includes('**判定結果');

    return NextResponse.json({ message: assistantMessage, sessionId, isDone });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
