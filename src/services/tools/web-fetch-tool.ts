/**
 * Web fetch tool — fetches and reads web page content.
 *
 * Ported from gg-framework WebFetchTool / tama-agent WebFetchTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

const DEFAULT_MAX_LENGTH = 10_000;
const FETCH_TIMEOUT = 30_000;

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\.0\.0\.0/,
  /^localhost$/i,
  /^\[::1\]$/,
  /^::1$/,
];

function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname;
    return PRIVATE_IP_PATTERNS.some((p) => p.test(host));
  } catch {
    return true; // Invalid URL — block
  }
}

function stripHtml(html: string): string {
  // Remove scripts, styles, nav, svg, and comments
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}

export function createWebFetchTool(): Tool {
  return {
    definition: {
      name: 'web_fetch',
      description:
        'Fetch and read content from a URL. Returns text content with HTML tags stripped. ' +
        'Blocks private/internal IPs for security.',
      input_schema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch',
          },
          max_length: {
            type: 'number',
            description: 'Maximum characters to return (default: 10000)',
          },
        },
        required: ['url'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const url = args.url as string;
      if (!url) return { text: 'Error: url is required.' };

      const maxLength = Number(args.max_length) || DEFAULT_MAX_LENGTH;

      if (isPrivateUrl(url)) {
        return { text: 'Error: Requests to private/internal IPs are blocked for security.' };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          return { text: `Error: HTTP ${response.status} ${response.statusText}` };
        }

        const contentType = response.headers.get('content-type') || '';
        const raw = await response.text();

        let text: string;
        if (contentType.includes('text/html')) {
          text = stripHtml(raw);
        } else {
          text = raw;
        }

        if (text.length > maxLength) {
          text = text.slice(0, maxLength) + `\n[...truncated at ${maxLength} chars]`;
        }

        return { text };
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          return { text: `Error: Request timed out after ${FETCH_TIMEOUT}ms` };
        }
        return { text: `Error fetching URL: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
