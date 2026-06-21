import { NextResponse } from "next/server";
import { ensureSchema, getAllStoresWithFlyers } from "@/lib/db";

export async function GET() {
  await ensureSchema();
  const stores = await getAllStoresWithFlyers();
  return NextResponse.json(stores);
}
