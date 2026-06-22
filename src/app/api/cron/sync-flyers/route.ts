import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { ensureSchema } from "@/lib/db";
import { syncFlyers, type HttpClient, type BlobClient } from "@/lib/sync";

export const maxDuration = 300;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function buildHttpClient(): HttpClient {
  return {
    async fetchText(url: string) {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) {
        throw new Error(`fetch failed for ${url}: ${response.status} ${response.statusText}`);
      }
      return response.text();
    },
  };
}

function buildBlobClient(): BlobClient {
  return {
    async upload(tokubaiStoreId: string, tokubaiImageId: string, sourceUrl: string) {
      const response = await fetch(sourceUrl);
      const bytes = await response.arrayBuffer();
      const blob = await put(`flyers/${tokubaiStoreId}/${tokubaiImageId}.jpg`, Buffer.from(bytes), {
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

  try {
    await ensureSchema();
    const result = await syncFlyers({
      http: buildHttpClient(),
      blob: buildBlobClient(),
      concurrency: 5,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
