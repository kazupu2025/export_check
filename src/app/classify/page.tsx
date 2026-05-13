'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Phase = 'input_material' | 'input_specs' | 'result';

interface ProductForm {
  id: string;
  label: string;
  description: string;
  articles: string[];
}

const PRODUCT_FORMS: ProductForm[] = [
  { id: 'fiber_material', label: '繊維・素材',       description: '炭素繊維、ガラス繊維、CFRP/GFRP 素材など',         articles: ['第四条'] },
  { id: 'shaped_article', label: '成型品・構造材',   description: '管・板・ブロックなどの複合材料成型品',             articles: ['第一条', '第三条'] },
  { id: 'machine_tool',   label: '工作機械・加工装置', description: 'マシニングセンタ、旋盤、数値制御工作機械など',   articles: ['第一条', '第五条'] },
  { id: 'laser_optics',   label: 'レーザー・光学機器', description: 'レーザー発振器、光ファイバー、センサーなど',     articles: ['第一条', '第九条'] },
  { id: 'electronics',    label: '電子機器・半導体',  description: '集積回路、コンピュータ、通信機器など',             articles: ['第六条', '第九条'] },
  { id: 'chemical',       label: '化学品・特殊材料',  description: '特殊金属、化学製剤、核燃料関連材料など',           articles: ['第二条', '第二条の二', '第三条'] },
  { id: 'all',            label: '不明・その他',      description: '当てはまる形態がない場合（全条文を検索）',         articles: [] },
];

const PARAM_HINTS: Record<string, string> = {
  '含有量':   'SiO₂等の主成分',
  '比強度':   '引張強さ ÷ 密度',
  '比弾性率': '弾性率 ÷ 密度',
  '昇華温度': '昇華開始温度',
  '引張強さ': '引張破断強度',
  '圧縮強度': '圧縮破断強度',
  '密度':     '体積質量',
  '軸数':     '繊維積層方向数（1=UD, 2=縦横, 4=±45°含む準等方性）',
  'ガラス転移点': '母材樹脂の軟化開始温度',
};

interface Parameter {
  parameter_ja: string;
  parameter_en: string | null;
  unit: string;
  display_expr: string;
}

interface ThresholdComparison {
  threshold: {
    article_num: string;
    item_num: string;
    parameter_ja: string;
    unit: string;
    threshold_value: number;
    threshold_op: string;
    display_expr: string;
    source_text: string;
  };
  userValue: number;
  exceeded: boolean;
  comparisonStr: string;
}

interface ClassificationResult {
  verdict: '許可必要' | '非該当（許可不要）' | '要人間確認';
  reason: string;
  comparisons: ThresholdComparison[];
  matchedItems: string[];
}

export default function ClassifyPage() {
  const [phase, setPhase] = useState<Phase>('input_material');
  const [materialInput, setMaterialInput] = useState('');
  const [selectedForm, setSelectedForm] = useState<ProductForm | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const searchParameters = async () => {
    if (!selectedForm) return;
    setLoading(true);
    const kws = materialInput.split(/[,、\s]+/).map((k) => k.trim()).filter(Boolean);
    setKeywords(kws);
    const articlesParam = selectedForm.articles.length > 0
      ? `&articles=${encodeURIComponent(selectedForm.articles.join(','))}`
      : '';
    const formParam = `&form=${encodeURIComponent(selectedForm.id)}`;
    const res = await fetch(`/api/classify?keywords=${encodeURIComponent(kws.join(','))}${articlesParam}${formParam}`);
    const data = await res.json() as { parameters: Parameter[] };
    setParameters(data.parameters);
    setSpecValues({});
    setPhase('input_specs');
    setLoading(false);
  };

  const runClassification = async () => {
    setLoading(true);
    const specs = parameters
      .filter((p) => specValues[p.parameter_ja] !== undefined && specValues[p.parameter_ja] !== '')
      .map((p) => ({
        parameter_ja: p.parameter_ja,
        parameter_en: p.parameter_en ?? undefined,
        value: parseFloat(specValues[p.parameter_ja]),
        unit: p.unit,
      }));

    const res = await fetch('/api/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords,
        specs,
        targetArticles: selectedForm?.articles ?? [],
        formId: selectedForm?.id ?? '',
        productName: materialInput,
        formLabel: selectedForm?.label ?? '',
      }),
    });
    const data = await res.json() as ClassificationResult;
    setResult(data);
    // 超過した行の条文を自動展開
    const autoExpand = new Set(
      data.comparisons.map((c, i) => c.exceeded ? String(i) : null).filter(Boolean) as string[]
    );
    setExpandedSources(autoExpand);
    setPhase('result');
    setLoading(false);
  };

  const reset = () => {
    setPhase('input_material');
    setMaterialInput('');
    setSelectedForm(null);
    setExpandedSources(new Set());
    setKeywords([]);
    setParameters([]);
    setSpecValues({});
    setResult(null);
  };

  const verdictStyle = (verdict: string) => {
    if (verdict === '許可必要') return 'bg-red-50 border-red-300 text-red-900';
    if (verdict === '非該当（許可不要）') return 'bg-green-50 border-green-300 text-green-900';
    return 'bg-yellow-50 border-yellow-300 text-yellow-900';
  };

  const verdictIcon = (verdict: string) => {
    if (verdict === '許可必要') return '🔴';
    if (verdict === '非該当（許可不要）') return '🟢';
    return '🟡';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">輸出管理 該否判定</h1>
          <p className="text-sm text-gray-500">貨物等省令に基づくパラメータ比較による自動判定</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          {(['品目入力', 'スペック入力', '判定結果'] as const).map((label, i) => {
            const phases: Phase[] = ['input_material', 'input_specs', 'result'];
            const active = phase === phases[i];
            const done = phases.indexOf(phase) > i;
            return (
              <span key={label} className="flex items-center gap-1">
                {i > 0 && <span className="text-gray-300">→</span>}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  active ? 'bg-blue-600 text-white' : done ? 'bg-gray-200 text-gray-600' : 'text-gray-400'
                }`}>
                  {label}
                </span>
              </span>
            );
          })}
        </div>

        {/* Phase 1: 品目入力 */}
        {phase === 'input_material' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">対象品目を入力してください</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
                  材料・品目名（複数の場合はカンマ区切り）
                </label>
                <Input
                  placeholder="例: CFRP、ガラス繊維織物、マシニングセンタ"
                  value={materialInput}
                  onChange={(e) => setMaterialInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && materialInput && selectedForm && searchParameters()}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-2 block">品目の形態</label>
                <div className="grid grid-cols-1 gap-2">
                  {PRODUCT_FORMS.map((form) => (
                    <button
                      key={form.id}
                      type="button"
                      onClick={() => setSelectedForm(form)}
                      className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                        selectedForm?.id === form.id
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="text-sm font-medium">{form.label}</span>
                      <span className="ml-2 text-xs text-gray-400">{form.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={searchParameters} disabled={!materialInput || !selectedForm || loading}>
                {loading ? '検索中…' : '規制パラメータを検索'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Phase 2: スペック入力 */}
        {phase === 'input_specs' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                実測値を入力してください
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {keywords.join('、')}
                  {selectedForm && (
                    <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      {selectedForm.label}
                    </span>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {parameters.length === 0 ? (
                <div className="text-center py-6 space-y-2">
                  <p className="text-gray-500">関連する規制パラメータが見つかりませんでした。</p>
                  <p className="text-xs text-gray-400">
                    閾値の抽出が未実行の可能性があります。先に「規制パラメータ管理」から閾値を抽出してください。
                  </p>
                  <Button variant="outline" onClick={reset} className="mt-2">やり直す</Button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {parameters.map((p) => (
                      <div key={p.parameter_ja} className="flex items-center gap-3">
                        <div className="w-52 shrink-0">
                          <p className="text-sm font-medium text-gray-800">
                            {p.parameter_ja}
                            {PARAM_HINTS[p.parameter_ja] && (
                              <span className="ml-1 text-xs font-normal text-gray-800">({PARAM_HINTS[p.parameter_ja]})</span>
                            )}
                          </p>
                          <p className="text-xs text-blue-600">閾値基準: {p.display_expr}</p>
                        </div>
                        <Input
                          type="number"
                          step="any"
                          placeholder={`数値`}
                          value={specValues[p.parameter_ja] ?? ''}
                          onChange={(e) =>
                            setSpecValues((prev) => ({ ...prev, [p.parameter_ja]: e.target.value }))
                          }
                          className="w-36"
                        />
                        <span className="text-sm text-gray-500">{p.unit}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    ※ 不明なパラメータは空欄可（空欄は「要人間確認」の対象になります）
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={runClassification} disabled={loading}>
                      {loading ? '判定中…' : '該否判定を実行'}
                    </Button>
                    <Button variant="outline" onClick={reset}>やり直す</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Phase 3: 判定結果 */}
        {phase === 'result' && result && (
          <div className="space-y-4">
            <div className={`border-2 rounded-xl p-5 ${verdictStyle(result.verdict)}`}>
              <div className="text-2xl font-bold mb-1">
                {verdictIcon(result.verdict)} {result.verdict}
              </div>
              <p className="text-sm">{result.reason}</p>
            </div>

            {result.comparisons.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">パラメータ比較結果</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-gray-500 text-xs">
                        <th className="text-left py-2 pr-4">パラメータ</th>
                        <th className="text-right py-2 pr-4">入力値</th>
                        <th className="text-center py-2 pr-4">規制閾値</th>
                        <th className="text-center py-2 pr-4">判定</th>
                        <th className="text-left py-2">根拠条文</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.comparisons.map((c, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{c.threshold.parameter_ja}</td>
                          <td className="py-2 pr-4 text-right font-mono">
                            {c.userValue} {c.threshold.unit}
                          </td>
                          <td className="py-2 pr-4 text-center text-gray-600">
                            {c.threshold.display_expr}
                          </td>
                          <td className="py-2 pr-4 text-center">
                            {c.exceeded
                              ? <span className="text-red-600 font-bold">超過 ✗</span>
                              : <span className="text-green-600 font-bold">以内 ✓</span>}
                          </td>
                          <td className="py-2">
                            <button
                              className="text-xs text-blue-600 hover:underline"
                              onClick={() => {
                                const key = String(i);
                                setExpandedSources((prev) => {
                                  const next = new Set(prev);
                                  next.has(key) ? next.delete(key) : next.add(key);
                                  return next;
                                });
                              }}
                            >
                              {c.threshold.article_num} {c.threshold.item_num} {expandedSources.has(String(i)) ? '▲' : '▼'}
                            </button>
                            {expandedSources.has(String(i)) && (
                              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                                {c.threshold.source_text}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="pt-4 text-xs text-gray-500 space-y-1">
                <p>⚠️ この判定は参考情報です。最終判断は担当者が確認してください。</p>
                <p>⚠️ 「許可必要」または「要人間確認」の場合はCISTECへの確認を推奨します。</p>
              </CardContent>
            </Card>

            <Button onClick={reset} variant="outline">新しい品目を判定する</Button>
          </div>
        )}
      </main>
    </div>
  );
}
