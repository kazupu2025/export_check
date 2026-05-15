import { NextResponse } from 'next/server';
import { applyThresholdPatches } from '@/lib/threshold-patches';
import { requireAdmin } from '@/lib/require-admin';

export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const result = await applyThresholdPatches();
  const status = result.errors.length > 0 ? 500 : 200;
  return NextResponse.json(result, { status });
}
