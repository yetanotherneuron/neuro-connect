import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import type { Components } from "react-markdown";

function Spoiler({ children }: { children?: React.ReactNode }) {
  return (
    <span
      className="spoiler"
      onClick={(e) => (e.currentTarget as HTMLElement).classList.toggle("revealed")}
      title="Click to reveal"
    >
      {children}
    </span>
  );
}

function TransformSpoilers(text: string): string {
  return text.replace(/\|\|([\s\S]+?)\|\|/g, "@@SPOILER@@$1@@/SPOILER@@");
}

const components: Components = {
  p({ children }) {
    const parts: React.ReactNode[] = [];
    const walk = (node: React.ReactNode): void => {
      if (typeof node === "string") {
        const chunks = node.split(/@@SPOILER@@([\s\S]+?)@@\/SPOILER@@/g);
        chunks.forEach((chunk, i) => {
          if (i % 2 === 1) parts.push(<Spoiler key={parts.length}>{chunk}</Spoiler>);
          else if (chunk) parts.push(chunk);
        });
      } else if (Array.isArray(node)) {
        node.forEach(walk);
      } else {
        parts.push(node);
      }
    };
    walk(children);
    return <p>{parts}</p>;
  },
};

export function RenderMarkdown({ content }: { content: string }) {
  const prepared = TransformSpoilers(content);
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
