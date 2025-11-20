import Head from "next/head";
import Link from "next/link";
import type { GetStaticPaths, GetStaticProps } from "next";
import ReactMarkdown from "react-markdown";
import fs from "fs";
import path from "path";

type DocPageProps = {
  content: string;
  title: string;
};

export default function DocPage({ content, title }: DocPageProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Head>
        <title>{title} | Hydrafactory Guides</title>
      </Head>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/" className="text-sm text-sky-400 hover:underline">← Back to Hydrafactory</Link>
        <article className="prose prose-invert mt-6">
          <ReactMarkdown>{content}</ReactMarkdown>
        </article>
      </main>
    </div>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const docsDir = path.join(process.cwd(), "docs");
  const entries = fs.readdirSync(docsDir).filter((file) => file.endsWith(".md"));
  const paths = entries.map((file) => ({ params: { slug: file.replace(/\.md$/, "") } }));

  return {
    paths,
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<DocPageProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const docsDir = path.join(process.cwd(), "docs");
  const filePath = path.join(docsDir, `${slug}.md`);
  const content = fs.readFileSync(filePath, "utf8");
  const title = slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" " );

  return {
    props: {
      content,
      title,
    },
  };
};
