/**
 * Web search tool — searches the web using cascading search engines.
 *
 * Ported from gg-framework WebSearchTool / tama-agent WebSearchTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_CAP = 20;
const FETCH_TIMEOUT = 15_000;

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
];

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '');
}

function isRateLimited(status: number): boolean {
  return status === 429 || status === 403 || status === 503;
}

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': randomUserAgent() },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const response = await fetchWithTimeout(
    `https://html.duckduckgo.com/html/?q=${encoded}`,
    FETCH_TIMEOUT,
  );
  if (isRateLimited(response.status)) throw new Error('Rate limited');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const results: SearchResult[] = [];

  // Parse DuckDuckGo HTML results
  const resultPattern = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = resultPattern.exec(html)) !== null) {
    results.push({
      url: decodeEntities(match[1]),
      title: decodeEntities(match[2]).trim(),
      snippet: decodeEntities(match[3]).trim(),
    });
  }

  return results;
}

async function searchDuckDuckGoLite(query: string): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const response = await fetchWithTimeout(
    `https://lite.duckduckgo.com/lite/?q=${encoded}`,
    FETCH_TIMEOUT,
  );
  if (isRateLimited(response.status)) throw new Error('Rate limited');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const results: SearchResult[] = [];

  // Parse Lite page results
  const linkPattern = /<a[^>]+href="([^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetPattern = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: { url: string; title: string }[] = [];
  let linkMatch;
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    links.push({
      url: decodeEntities(linkMatch[1]),
      title: decodeEntities(linkMatch[2]).trim(),
    });
  }

  const snippets: string[] = [];
  let snippetMatch;
  while ((snippetMatch = snippetPattern.exec(html)) !== null) {
    snippets.push(decodeEntities(snippetMatch[1]).trim());
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      url: links[i].url,
      title: links[i].title,
      snippet: snippets[i] || '',
    });
  }

  return results;
}

async function searchBrave(query: string): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const response = await fetchWithTimeout(
    `https://search.brave.com/search?q=${encoded}&source=web`,
    FETCH_TIMEOUT,
  );
  if (isRateLimited(response.status)) throw new Error('Rate limited');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const results: SearchResult[] = [];

  const pattern = /<a[^>]+class="[^"]*result-header[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]+class="[^"]*snippet-description[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    results.push({
      url: decodeEntities(match[1]),
      title: decodeEntities(match[2]).trim(),
      snippet: decodeEntities(match[3]).trim(),
    });
  }

  return results;
}

async function searchGoogle(query: string): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const response = await fetchWithTimeout(
    `https://www.google.com/search?q=${encoded}&hl=en`,
    FETCH_TIMEOUT,
  );
  if (isRateLimited(response.status)) throw new Error('Rate limited');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const results: SearchResult[] = [];

  const pattern = /<a[^>]+href="\/url\?q=([^&"]+)[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const url = decodeURIComponent(decodeEntities(match[1]));
    if (url.startsWith('http')) {
      results.push({
        url,
        title: decodeEntities(match[2]).trim(),
        snippet: decodeEntities(match[3]).trim(),
      });
    }
  }

  return results;
}

export function createWebSearchTool(): Tool {
  return {
    definition: {
      name: 'web_search',
      description:
        'Search the web and return results. Uses cascading search engines ' +
        '(DuckDuckGo, Brave, Google). Returns markdown-formatted results.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          max_results: {
            type: 'number',
            description: 'Maximum results to return (default: 5, max: 20)',
          },
        },
        required: ['query'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const query = args.query as string;
      if (!query) return { text: 'Error: query is required.' };

      const maxResults = Math.min(
        Number(args.max_results) || DEFAULT_MAX_RESULTS,
        MAX_RESULTS_CAP,
      );

      const engines = [
        { name: 'DuckDuckGo', fn: searchDuckDuckGo },
        { name: 'DuckDuckGo Lite', fn: searchDuckDuckGoLite },
        { name: 'Brave', fn: searchBrave },
        { name: 'Google', fn: searchGoogle },
      ];

      for (const engine of engines) {
        try {
          const results = await engine.fn(query);
          if (results.length > 0) {
            const limited = results.slice(0, maxResults);
            const formatted = limited
              .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
              .join('\n\n');
            return { text: `Search results (via ${engine.name}):\n\n${formatted}` };
          }
        } catch {
          // Try next engine
          continue;
        }
      }

      return { text: 'No results found from any search engine.' };
    },
  };
}
