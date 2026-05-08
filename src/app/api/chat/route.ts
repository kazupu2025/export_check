import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/supabase';
import { buildClassifySystemPrompt } from '@/lib/law-interpreter';
import type { ChatMessage } from '@/lib/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/chat
// チャット形式の該否判定AI
export async function POST(req: NextRequest) {
  try {
    const { messages, sessionId } = await req.json() as {
      messages: ChatMessage[];
      sessionId: string;
    };

    // DBから有効な規制ルールを取得
    const db = createServerClient();
    const { data: rules } = await db
      .from('regulation_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority');

    const systemPrompt = buildClassifySystemPrompt(
      JSON.stringify(rules ?? [], null, 2)
    );

    // Anthropic Messages API形式に変換
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

    // 判定完了を検出（「判定結果:」が含まれる場合）
    const isDone = assistantMessage.includes('判定結果:') ||
                   assistantMessage.includes('**判定結果');

    return NextResponse.json({
      message: assistantMessage,
      sessionId,
      isDone,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
