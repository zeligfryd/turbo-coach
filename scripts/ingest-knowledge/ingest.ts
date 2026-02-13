import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";

type KnowledgeChunkInsert = {
  content: string;
  source: string;
  category: string | null;
  embedding: number[];
};

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const splitMarkdownIntoSections = (markdown: string): string[] => {
  const lines = markdown.split("\n");
  const sections: string[] = [];
  let currentSection: string[] = [];

  for (const line of lines) {
    if (line.startsWith("#") && currentSection.length > 0) {
      sections.push(currentSection.join("\n").trim());
      currentSection = [line];
      continue;
    }
    currentSection.push(line);
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join("\n").trim());
  }

  return sections.filter(Boolean);
};

const splitSectionIntoChunks = (section: string, maxChars: number): string[] => {
  if (section.length <= maxChars) {
    return [section];
  }

  const paragraphs = section.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current.trim());
      current = paragraph;
      continue;
    }

    // Very large paragraph fallback: hard split.
    for (let i = 0; i < paragraph.length; i += maxChars) {
      chunks.push(paragraph.slice(i, i + maxChars).trim());
    }
    current = "";
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(Boolean);
};

const buildChunks = (markdown: string, maxCharsPerChunk: number): string[] => {
  const sections = splitMarkdownIntoSections(markdown);
  return sections.flatMap((section) => splitSectionIntoChunks(section, maxCharsPerChunk));
};

async function main() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openAiApiKey = requiredEnv("OPENAI_API_KEY");

  const sourcePath = resolve(process.env.INGEST_SOURCE ?? "./data/book/source.md");
  const sourceLabel = process.env.INGEST_SOURCE_LABEL ?? "Cycling source";
  const category = process.env.INGEST_CATEGORY ?? null;
  const maxCharsPerChunk = Number(process.env.INGEST_MAX_CHARS_PER_CHUNK ?? "1800");

  console.log("Reading source file:", sourcePath);
  const markdown = await readFile(sourcePath, "utf-8");
  const chunks = buildChunks(markdown, maxCharsPerChunk);

  if (chunks.length === 0) {
    throw new Error("No chunks were generated. Check source formatting and chunk settings.");
  }

  console.log(`Generated ${chunks.length} chunks. Starting embeddings...`);

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const openai = createOpenAI({ apiKey: openAiApiKey });

  const rows: KnowledgeChunkInsert[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    const { embedding } = await embed({
      model: openai.textEmbeddingModel("text-embedding-3-small"),
      value: content,
    });

    rows.push({
      content,
      source: sourceLabel,
      category,
      embedding,
    });

    if ((i + 1) % 20 === 0 || i === chunks.length - 1) {
      console.log(`Embedded ${i + 1}/${chunks.length} chunks`);
    }
  }

  console.log("Writing chunks to Supabase...");
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("knowledge_chunks").insert(batch);
    if (error) {
      throw new Error(`Insert failed at batch ${i / batchSize + 1}: ${error.message}`);
    }
    console.log(`Inserted ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
  }

  console.log("Ingestion complete.");
}

main().catch((error) => {
  console.error("Ingestion failed:", error);
  process.exit(1);
});
