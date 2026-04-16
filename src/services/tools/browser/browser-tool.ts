/**
 * Browser tool — controls a browser via Chrome DevTools Protocol.
 *
 * Ported from tama-agent BrowserTool.swift / pocket-agent browser/index.ts.
 * Supports navigate, click, type, get_text, get_html, screenshot, evaluate, wait actions.
 */

import type { Tool, ToolOutput } from '../../../types/index.ts';
import { BrowserManager } from './browser-manager.ts';
import type { CDPConnection } from './cdp-connection.ts';

const TEXT_CAP = 50 * 1024; // 50KB
const HTML_CAP = 100 * 1024; // 100KB

const manager = new BrowserManager();

async function getConnection(): Promise<CDPConnection> {
  return await manager.ensureConnected();
}

async function handleNavigate(args: Record<string, unknown>): Promise<ToolOutput> {
  const url = args.url as string;
  if (!url) return { text: 'Error: url is required for navigate action.' };

  const conn = await getConnection();
  await conn.send('Page.navigate', { url });
  // Wait for load
  await conn.send('Page.enable');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return { text: `Navigated to ${url}` };
}

async function handleClick(args: Record<string, unknown>): Promise<ToolOutput> {
  const selector = args.selector as string;
  if (!selector) return { text: 'Error: selector is required for click action.' };

  const conn = await getConnection();
  const result = await conn.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})?.click(); 'clicked'`,
    returnByValue: true,
  }) as Record<string, unknown>;

  const evalResult = result.result as Record<string, unknown> | undefined;
  if (evalResult?.value === 'clicked') {
    return { text: `Clicked element: ${selector}` };
  }
  return { text: `Error: Element not found: ${selector}` };
}

async function handleType(args: Record<string, unknown>): Promise<ToolOutput> {
  const selector = args.selector as string;
  const text = args.text as string;
  if (!selector) return { text: 'Error: selector is required for type action.' };
  if (!text) return { text: 'Error: text is required for type action.' };

  const conn = await getConnection();
  // Focus the element
  await conn.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`,
  });

  // Type each character
  for (const char of text) {
    await conn.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
    });
    await conn.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
    });
  }

  return { text: `Typed "${text}" into ${selector}` };
}

async function handleGetText(args: Record<string, unknown>): Promise<ToolOutput> {
  const selector = (args.selector as string) || 'body';

  const conn = await getConnection();
  const result = await conn.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})?.innerText || ''`,
    returnByValue: true,
  }) as Record<string, unknown>;

  const evalResult = result.result as Record<string, unknown> | undefined;
  let text = String(evalResult?.value || '');
  if (text.length > TEXT_CAP) {
    text = text.slice(0, TEXT_CAP) + `\n[...truncated at ${TEXT_CAP} chars]`;
  }
  return { text };
}

async function handleGetHtml(args: Record<string, unknown>): Promise<ToolOutput> {
  const selector = (args.selector as string) || 'html';

  const conn = await getConnection();
  const result = await conn.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})?.outerHTML || ''`,
    returnByValue: true,
  }) as Record<string, unknown>;

  const evalResult = result.result as Record<string, unknown> | undefined;
  let html = String(evalResult?.value || '');
  if (html.length > HTML_CAP) {
    html = html.slice(0, HTML_CAP) + `\n[...truncated at ${HTML_CAP} chars]`;
  }
  return { text: html };
}

async function handleScreenshot(): Promise<ToolOutput> {
  const conn = await getConnection();
  const result = await conn.send('Page.captureScreenshot', {
    format: 'png',
  }) as Record<string, unknown>;

  const data = result.data as string;
  if (!data) {
    return { text: 'Error: Failed to capture browser screenshot.' };
  }

  return {
    text: 'Browser screenshot captured.',
    images: [{ data, mediaType: 'image/png' }],
  };
}

async function handleEvaluate(args: Record<string, unknown>): Promise<ToolOutput> {
  const expression = (args.text as string) || (args.selector as string);
  if (!expression) return { text: 'Error: JavaScript expression required (pass in text field).' };

  const conn = await getConnection();
  const result = await conn.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }) as Record<string, unknown>;

  const evalResult = result.result as Record<string, unknown> | undefined;
  if (evalResult?.type === 'undefined') {
    return { text: 'undefined' };
  }
  const exceptionDetails = result.exceptionDetails as Record<string, unknown> | undefined;
  if (exceptionDetails) {
    return { text: `Error: ${JSON.stringify(exceptionDetails)}` };
  }
  return { text: JSON.stringify(evalResult?.value ?? evalResult, null, 2) };
}

async function handleWait(args: Record<string, unknown>): Promise<ToolOutput> {
  const selector = args.selector as string;
  const timeout = Number(args.timeout) || 5000;

  if (!selector) return { text: 'Error: selector is required for wait action.' };

  const conn = await getConnection();
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await conn.send('Runtime.evaluate', {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true,
    }) as Record<string, unknown>;

    const evalResult = result.result as Record<string, unknown> | undefined;
    if (evalResult?.value === true) {
      return { text: `Element found: ${selector}` };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { text: `Timeout: Element "${selector}" not found after ${timeout}ms` };
}

export function createBrowserTool(): Tool {
  return {
    definition: {
      name: 'browser',
      description:
        'Control a web browser via Chrome DevTools Protocol. ' +
        'Actions: navigate, click, type, get_text, get_html, screenshot, evaluate, wait.',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['navigate', 'click', 'type', 'get_text', 'get_html', 'screenshot', 'evaluate', 'wait'],
            description: 'Browser action to perform',
          },
          url: {
            type: 'string',
            description: 'URL to navigate to (for navigate action)',
          },
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          text: {
            type: 'string',
            description: 'Text to type or JavaScript to evaluate',
          },
          headless: {
            type: 'boolean',
            description: 'Run browser in headless mode (default: false)',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds for wait action',
          },
        },
        required: ['action'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const action = args.action as string;
      if (!action) return { text: 'Error: action is required.' };

      try {
        switch (action) {
          case 'navigate':
            return await handleNavigate(args);
          case 'click':
            return await handleClick(args);
          case 'type':
            return await handleType(args);
          case 'get_text':
            return await handleGetText(args);
          case 'get_html':
            return await handleGetHtml(args);
          case 'screenshot':
            return await handleScreenshot();
          case 'evaluate':
            return await handleEvaluate(args);
          case 'wait':
            return await handleWait(args);
          default:
            return { text: `Error: Unknown action "${action}". Use: navigate, click, type, get_text, get_html, screenshot, evaluate, wait.` };
        }
      } catch (e) {
        return { text: `Browser error: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
