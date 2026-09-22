import type { ReactNode } from "react";

type ListItem = {
  text: string;
  number?: number;
  children: ListItem[];
};

type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "ul"; items: ListItem[] }
  | { type: "ol"; items: ListItem[] }
  | { type: "code"; text: string };

const INLINE =
  /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*\n]+\*)/g;

const ORDERED = /^(\s*)(\d+)[.)]\s+(.+)$/;
const BULLET = /^(\s*)[-*]\s+(.+)$/;

export function ChatMarkdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  if (!blocks.length) return null;

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        if (block.type === "h") {
          return (
            <p key={index} className="font-semibold text-text">
              {renderInline(block.text)}
            </p>
          );
        }
        if (block.type === "ul" || block.type === "ol") {
          return (
            <ListBlock key={index} ordered={block.type === "ol"} items={block.items} />
          );
        }
        if (block.type === "code") {
          return (
            <pre
              key={index}
              className="overflow-x-auto bg-bg-elevated px-2.5 py-2 font-mono text-xs leading-relaxed text-text"
            >
              {block.text}
            </pre>
          );
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

function ListBlock({ ordered, items }: { ordered: boolean; items: ListItem[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          {ordered ? (
            <span className="w-5 shrink-0 font-mono text-[11px] leading-relaxed text-text-dim tabular-nums">
              {item.number ?? index + 1}.
            </span>
          ) : (
            <span className="mt-[0.55em] size-1 shrink-0 bg-highlight" />
          )}
          <div className="min-w-0">
            <p>{renderInline(item.text)}</p>
            {item.children.length ? (
              <div className="mt-1.5">
                <ListBlock ordered={false} items={item.children} />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (heading) {
      blocks.push({ type: "h", text: heading[2] ?? "" });
      index += 1;
      continue;
    }

    const list = parseList(lines, index);
    if (list) {
      blocks.push(list.block);
      index = list.nextIndex;
      continue;
    }

    blocks.push({ type: "p", text: line.trim() });
    index += 1;
  }

  return blocks;
}

function parseList(
  lines: string[],
  start: number,
): { block: Extract<Block, { type: "ul" | "ol" }>; nextIndex: number } | null {
  const first = lines[start] ?? "";
  const ordered = ORDERED.exec(first);
  const bullet = BULLET.exec(first);
  if (!ordered && !bullet) return null;

  if (ordered) {
    const items: ListItem[] = [];
    let index = start;
    while (index < lines.length) {
      const cursor = skipBlanks(lines, index, items.length > 0);
      const line = lines[cursor] ?? "";
      const match = ORDERED.exec(line);
      if (!match || match[1].length > 0) break;
      const item: ListItem = {
        number: Number(match[2]),
        text: match[3] ?? "",
        children: [],
      };
      index = cursor + 1;
      while (index < lines.length) {
        const childCursor = skipBlanks(lines, index, true);
        const child = BULLET.exec(lines[childCursor] ?? "");
        if (!child) break;
        item.children.push({ text: child[2] ?? "", children: [] });
        index = childCursor + 1;
      }
      items.push(item);
    }
    if (!items.length) return null;
    return { block: { type: "ol", items }, nextIndex: index };
  }

  const items: ListItem[] = [];
  let index = start;
  while (index < lines.length && BULLET.test(lines[index] ?? "")) {
    const match = BULLET.exec(lines[index] ?? "");
    items.push({ text: match?.[2] ?? "", children: [] });
    index += 1;
  }
  return { block: { type: "ul", items }, nextIndex: index };
}

function skipBlanks(lines: string[], index: number, allow: boolean) {
  if (!allow) return index;
  let cursor = index;
  while (cursor < lines.length && !(lines[cursor] ?? "").trim()) cursor += 1;
  return cursor;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="bg-bg-elevated px-1 py-px font-mono text-[0.85em] text-text"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={index}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-text-dim underline-offset-2 hover:decoration-text"
        >
          {link[1]}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}
