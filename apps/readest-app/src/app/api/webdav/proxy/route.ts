import { NextRequest, NextResponse } from 'next/server';
import { isBlockedHost } from '@/utils/network';

async function handleRequest(request: NextRequest, method: string) {
  const url = request.nextUrl.searchParams.get('url');
  const auth = request.nextUrl.searchParams.get('auth');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http(s) URLs supported' }, { status: 400 });
  }
  if (isBlockedHost(parsedUrl.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  if (auth) headers['Authorization'] = auth;

  const depth = request.nextUrl.searchParams.get('depth');
  if (depth) headers['Depth'] = depth;

  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  let body: string | undefined;
  if (method === 'PROPFIND' || method === 'PUT') {
    body = await request.text();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const respHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Depth',
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

export async function PROPFIND(request: NextRequest) {
  return handleRequest(request, 'PROPFIND');
}

export async function GET(request: NextRequest) {
  return handleRequest(request, 'GET');
}

export async function HEAD(request: NextRequest) {
  return handleRequest(request, 'HEAD');
}

export async function PUT(request: NextRequest) {
  return handleRequest(request, 'PUT');
}

export async function DELETE(request: NextRequest) {
  return handleRequest(request, 'DELETE');
}

export async function MKCOL(request: NextRequest) {
  return handleRequest(request, 'MKCOL');
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Depth',
    },
  });
}
