'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ChatMessage } from '@/lib/types';

type Phase = 'identifying' | 'collecting' | 'done';

const PHASE_LABELS: Record<Phase, string> = {
  identifying: '① 品目特定',
  collecting:  '② スペック確認',
  done:        '③ 判定完了',
};

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: `輸出管理 該否判定アシスタントです。

輸出したい製品・品目について教えてください。
製品名や材料の種類、用途などを自由に入力してください。

例：「ガラス繊維のプリプレグを航空機メーカーに輸出したい」`,
  timestamp: new Date(),
};

export default function ClassifyPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>('identifying');
  const [sessionId] = useState(() => crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const detectPhase = (text: string): Phase => {
    if (text.includes('判定結果:') || text.includes('**判定結果')) return 'done';
    if (text.includes('比弾性率') || text.includes('比強度') ||
        text.includes('融点') || text.includes('スペック') ||
        text.includes('数値')) return 'collecting';
    return 'identifying';
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, sessionId }),
      });
      const data = await res.json() as { message: string; isDone: boolean };

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setPhase(detectPhase(data.message));
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'エラーが発生しました。再度お試しください。',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const reset = () => {
    setMessages([WELCOME_MESSAGE]);
    setPhase('identifying');
    setInput('');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ヘッダー */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">輸出管理 該否判定</h1>
          <p className="text-sm text-gray-500">安全保障貿易管理（外為法）リスト規制チェック</p>
        </div>
        <div className="flex items-center gap-3">
          {/* フェーズインジケーター */}
          {(['identifying', 'collecting', 'done'] as Phase[]).map((p) => (
            <Badge
              key={p}
              variant={phase === p ? 'default' : 'outline'}
              className={phase === p ? 'bg-blue-600' : 'text-gray-400'}
            >
              {PHASE_LABELS[p]}
            </Badge>
          ))}
          <Button variant="outline" size="sm" onClick={reset}>
            リセット
          </Button>
        </div>
      </header>

      {/* メッセージエリア */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Card
                className={`max-w-[85%] ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white border-gray-200'
                }`}
              >
                <CardContent className="px-4 py-3">
                  {msg.role === 'assistant' ? (
                    <div
                      className="text-sm whitespace-pre-wrap prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: formatMarkdown(msg.content),
                      }}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                  <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                    {msg.timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </CardContent>
              </Card>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <Card className="bg-white border-gray-200">
                <CardContent className="px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* 入力エリア */}
      <footer className="bg-white border-t px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              phase === 'done'
                ? '判定が完了しました。「リセット」で新しい判定を開始できます。'
                : 'メッセージを入力（Enterで送信、Shift+Enterで改行）'
            }
            disabled={loading || phase === 'done'}
            className="resize-none min-h-[60px] max-h-[120px]"
            rows={2}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || loading || phase === 'done'}
            className="self-end bg-blue-600 hover:bg-blue-700"
          >
            送信
          </Button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          ※ 判定結果は補助情報です。最終判断は担当者が行い、必要に応じてCISTECへご確認ください。
        </p>
      </footer>
    </div>
  );
}

// 簡易Markdownレンダラー（太字・表・改行）
function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n---\n/g, '<hr class="my-3 border-gray-200" />')
    .replace(/\n/g, '<br />')
    .replace(/\|(.*?)\|/g, (match) => {
      if (match.includes('---')) return '';
      const cells = match.split('|').filter(Boolean).map((c) => c.trim());
      return `<tr>${cells.map((c) => `<td class="border px-2 py-1 text-xs">${c}</td>`).join('')}</tr>`;
    });
}
