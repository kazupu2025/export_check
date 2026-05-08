'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DbRegulationRule } from '@/lib/types';

const CONDITION_TYPE_CONFIG = {
  MATCH:          { label: '該当条件', color: 'bg-red-100 text-red-700 border-red-200' },
  EXCLUDE:        { label: '除外規定', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  REQUIRE_REVIEW: { label: '要確認',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
};

export default function RegulationsPage() {
  const [rules, setRules] = useState<DbRegulationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [interpreting, setInterpreting] = useState(false);
  const [fetchResult, setFetchResult] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/regulations');
      const data = await res.json() as { rules: DbRegulationRule[] };
      setRules(data.rules ?? []);
    } finally {
      setLoading(false);
    }
  };

  // e-gov XML取得 → Gemini解釈 → DB保存
  const runInterpretation = async () => {
    setInterpreting(true);
    setFetchResult(null);
    try {
      const res = await fetch('/api/interpret-law', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetArticles: ['第一条', '第四条'],
          regulationItems: ['5の項(18)', '2の項(17)'],
          saveToDb: true,
        }),
      });
      const data = await res.json() as { ruleCount: number; sourceLaw: string; error?: string };
      if (data.error) throw new Error(data.error);
      setFetchResult(`✅ ${data.ruleCount}件のルールを取得・保存しました（${data.sourceLaw}）`);
      await loadRules();
    } catch (e) {
      setFetchResult(`❌ エラー: ${e instanceof Error ? e.message : '不明なエラー'}`);
    } finally {
      setInterpreting(false);
    }
  };

  const grouped = rules.reduce<Record<string, DbRegulationRule[]>>((acc, rule) => {
    const key = rule.regulation_item;
    acc[key] = [...(acc[key] ?? []), rule];
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">規制ルール管理</h1>
            <p className="text-sm text-gray-500">
              e-gov 貨物等省令から自動取得・Geminiで解釈したルール一覧
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={runInterpretation}
              disabled={interpreting}
              className="bg-green-600 hover:bg-green-700"
            >
              {interpreting ? '取得・解釈中…' : '🔄 法令を最新化'}
            </Button>
            <Button variant="outline" onClick={loadRules}>再読み込み</Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {fetchResult && (
          <div className={`p-3 rounded-lg text-sm ${fetchResult.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {fetchResult}
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-500 py-12">読み込み中…</p>
        ) : rules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500 mb-4">規制ルールがまだ登録されていません。</p>
              <Button onClick={runInterpretation} disabled={interpreting}>
                🔄 e-govから法令を取得してルールを生成する
              </Button>
            </CardContent>
          </Card>
        ) : (
          Object.entries(grouped).map(([regulationItem, groupRules]) => (
            <Card key={regulationItem}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {regulationItem}
                  <Badge variant="outline" className="ml-2 text-xs">{groupRules.length}件</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {groupRules
                  .sort((a, b) => a.priority - b.priority)
                  .map((rule) => {
                    const cfg = CONDITION_TYPE_CONFIG[rule.condition_type];
                    const isExpanded = expandedId === rule.id;
                    return (
                      <div
                        key={rule.id}
                        className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandedId(isExpanded ? null : rule.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                {rule.rule_code}
                              </code>
                              <Badge className={`text-xs border ${cfg.color}`}>
                                {cfg.label}
                              </Badge>
                              <span className="text-xs text-gray-500">{rule.sub_item}</span>
                            </div>
                            <p className="text-sm mt-1 text-gray-700">{rule.description_ja}</p>
                          </div>
                          <span className="text-gray-400 text-xs mt-1">{isExpanded ? '▲' : '▼'}</span>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 space-y-2 text-xs border-t pt-3">
                            <div>
                              <span className="font-medium text-gray-600">判定条件：</span>
                              <span className="text-gray-700">{rule.condition_description}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600">JSONLogic：</span>
                              <pre className="bg-gray-100 p-2 rounded mt-1 overflow-x-auto">
                                {JSON.stringify(rule.condition_logic, null, 2)}
                              </pre>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded p-2">
                              <span className="font-medium text-amber-700">根拠条文：</span>
                              <p className="text-amber-800 mt-1 whitespace-pre-wrap">{rule.source_text}</p>
                            </div>
                            <div className="flex gap-4 text-gray-500">
                              <span>法令版: {rule.law_version || '不明'}</span>
                              <span>有効開始: {rule.effective_from}</span>
                              {rule.effective_to && <span>有効終了: {rule.effective_to}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
