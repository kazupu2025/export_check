import { NextResponse } from 'next/server';
import { applyThresholdPatches } from '@/lib/threshold-patches';

export async function POST() {
  const result = await applyThresholdPatches();
  const status = result.errors.length > 0 ? 500 : 200;
  return NextResponse.json(result, { status });
}
