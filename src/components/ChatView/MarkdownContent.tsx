import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { CodeBlock } from "./CodeBlock";

interface MarkdownContentProps {
  content: string;
}

/**
 * Renders markdown with custom component overrides.
 *
 * Mirrors the macOS tama-agent's MarkdownRenderer.swift rendering rules.
 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? "");
    const codeStr = String(children).replace(/\n$/, "");

    // Block code (has language class or is inside pre via rehype)
    if (match) {
      return <CodeBlock language={match[1]}>{codeStr}</CodeBlock>;
    }

    // Check if this is a block-level code (wrapped in <pre>)
    // react-markdown v9+ passes `node` — if parent is <pre>, it's a block
    const node = (props as Record<string, unknown>).node as
      | { position?: unknown; parent?: { tagName?: string } }
      | undefined;
    const isInline = node?.parent?.tagName !== "pre" && !className;

    if (isInline) {
      return (
        <code
          className="rounded-[4px] bg-white/[0.08] px-1.5 py-0.5 text-[13px] text-text-primary font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    return <CodeBlock>{codeStr}</CodeBlock>;
  },

  pre({ children }) {
    // Let <code> inside <pre> handle rendering via CodeBlock
    return <>{children}</>;
  },

  img({ src, alt, ...props }) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        className="max-w-[600px] w-full rounded-lg my-2 cursor-pointer"
        loading="lazy"
        {...props}
      />
    );
  },

  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        className="text-blue-400 underline hover:text-blue-300 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    );
  },

  table({ children, ...props }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="border-collapse w-full text-sm" {...props}>
          {children}
        </table>
      </div>
    );
  },

  th({ children, ...props }) {
    return (
      <th
        className="border border-white/[0.12] px-3 py-1.5 text-left font-semibold bg-white/[0.04]"
        {...props}
      >
        {children}
      </th>
    );
  },

  td({ children, ...props }) {
    return (
      <td className="border border-white/[0.12] px-3 py-1.5" {...props}>
        {children}
      </td>
    );
  },

  blockquote({ children, ...props }) {
    return (
      <blockquote
        className="border-l-2 border-white/20 pl-3 text-text-secondary italic my-2"
        {...props}
      >
        {children}
      </blockquote>
    );
  },

  ul({ children, ...props }) {
    return (
      <ul className="list-disc pl-6 my-2 space-y-1" {...props}>
        {children}
      </ul>
    );
  },

  ol({ children, ...props }) {
    return (
      <ol className="list-decimal pl-6 my-2 space-y-1" {...props}>
        {children}
      </ol>
    );
  },

  li({ children, ...props }) {
    return (
      <li className="text-text-primary" {...props}>
        {children}
      </li>
    );
  },

  h1({ children, ...props }) {
    return (
      <h1 className="text-2xl font-bold mt-4 mb-2" {...props}>
        {children}
      </h1>
    );
  },

  h2({ children, ...props }) {
    return (
      <h2 className="text-xl font-bold mt-3 mb-2" {...props}>
        {children}
      </h2>
    );
  },

  h3({ children, ...props }) {
    return (
      <h3 className="text-lg font-semibold mt-3 mb-1" {...props}>
        {children}
      </h3>
    );
  },

  h4({ children, ...props }) {
    return (
      <h4 className="text-base font-semibold mt-2 mb-1" {...props}>
        {children}
      </h4>
    );
  },

  h5({ children, ...props }) {
    return (
      <h5 className="text-sm font-semibold mt-2 mb-1" {...props}>
        {children}
      </h5>
    );
  },

  h6({ children, ...props }) {
    return (
      <h6 className="text-xs font-semibold mt-2 mb-1 text-text-secondary" {...props}>
        {children}
      </h6>
    );
  },

  p({ children, ...props }) {
    return (
      <p className="my-1.5 leading-relaxed" {...props}>
        {children}
      </p>
    );
  },

  hr(props) {
    return <hr className="border-white/10 my-4" {...props} />;
  },
};
