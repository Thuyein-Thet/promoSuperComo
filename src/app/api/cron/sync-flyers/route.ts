import { NextRequest, NextResponse } from "next/server";
import Firecrawl from "firecrawl";
import { put, del } from "@vercel/blob";
import { ensureSchema } from "@/lib/db";
import { syncFlyers, type FirecrawlClient, type BlobClient } from "@/lib/sync";

export const maxDuration = 300;

function buildFirecrawlClient(): FirecrawlClient {
  const client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY! });
  return {
    async scrape(url: string) {
      const doc = await client.scrape(url);
      return { markdown: doc.markdown ?? "" };
    },
  };
}

function buildBlobClient(): BlobClient {
  return {
    async upload(tokubaiImageId: string, sourceUrl: string) {
      const response = await fetch(sourceUrl);
      const bytes = await response.arrayBuffer();
      const blob = await put(`flyers/${tokubaiImageId}.jpg`, Buffer.from(bytes), {
        access: "public",
        addRandomSuffix: false,
      });
      return blob.url;
    },
    async delete(blobUrl: string) {
      await del(blobUrl);
    },
  };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const result = await syncFlyers({
    firecrawl: buildFirecrawlClient(),
    blob: buildBlobClient(),
    concurrency: 8,
  });

  return NextResponse.json(result);
}
