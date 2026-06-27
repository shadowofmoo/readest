import { NextRequest, NextResponse } from 'next/server';

async function proxyToWebDAV(
  url: string,
  method: string,
  auth: string | null,
  body: string | null,
  depth: string | null,
  contentType: string | null,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http(s) URLs supported' }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  if (auth) headers['Authorization'] = auth;
  if (depth) headers['Depth'] = depth;
  if (contentType) headers['Content-Type'] = contentType;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body || undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const respHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
    };

    const responseContentType = response.headers.get('content-type');
    if (responseContentType) respHeaders['Content-Type'] = responseContentType;

    if (method === 'HEAD') {
      return new NextResponse(null, { status: response.status, headers: respHeaders });
    }

    const buf = await response.arrayBuffer();
    respHeaders['Content-Length'] = buf.byteLength.toString();

    return new NextResponse(buf, { status: response.status, headers: respHeaders });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const auth = request.nextUrl.searchParams.get('auth');
  const method = request.nextUrl.searchParams.get('method') || 'GET';
  const depth = request.nextUrl.searchParams.get('depth');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let body: string | null = null;
  if (method === 'PROPFIND' || method === 'PUT') {
    body = await request.text();
  }
  const contentType = method === 'PUT' ? request.headers.get('content-type') : null;

  return proxyToWebDAV(url, method, auth, body, depth, contentType);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
