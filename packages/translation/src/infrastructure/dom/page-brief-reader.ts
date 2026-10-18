import { Option } from "@lambe/kernel/option";
import { LanguageCode } from "../../domain/language/value-objects/language-code.vo";
import type { PageBrief } from "../../domain/page/page-brief";

const SECTION_HEADING_LIMIT = 5;

const cleanText = (text: string | null): string => (text ?? "").replace(/\s+/g, " ").trim();

function sourceLanguage(doc: Document): Option<LanguageCode> {
  const lang = cleanText(doc.documentElement.getAttribute("lang"));

  if (lang === "") return Option.none();

  const code = LanguageCode.create(lang);

  return code.isSuccess ? Option.some(code.getValue()) : Option.none();
}

function headings(doc: Document): string[] {
  const title = cleanText(doc.querySelector("h1")?.textContent ?? null);

  const sections = [...doc.querySelectorAll("h2, h3")]
    .map((heading) => cleanText(heading.textContent))
    .filter((text) => text !== "")
    .slice(0, SECTION_HEADING_LIMIT);

  return title === "" ? sections : [title, ...sections];
}

export function readPageBrief(doc: Document): PageBrief {
  return {
    host: doc.location?.host ?? "",
    title: cleanText(doc.title),
    description: cleanText(
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
    ),
    headings: headings(doc),
    sourceLanguage: sourceLanguage(doc),
  };
}
