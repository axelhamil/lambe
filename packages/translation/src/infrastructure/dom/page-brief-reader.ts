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

type TextOf = (element: Element) => string;

const liveText: TextOf = (element) => element.textContent ?? "";

function headings(doc: Document, textOf: TextOf): string[] {
  const h1 = doc.querySelector("h1");
  const title = h1 === null ? "" : cleanText(textOf(h1));

  const sections = [...doc.querySelectorAll("h2, h3")]
    .map((heading) => cleanText(textOf(heading)))
    .filter((text) => text !== "")
    .slice(0, SECTION_HEADING_LIMIT);

  return title === "" ? sections : [title, ...sections];
}

export function readPageBrief(doc: Document, textOf: TextOf = liveText): PageBrief {
  return {
    kind: "page",
    host: doc.location?.host ?? "",
    url: doc.location?.href ?? "",
    title: cleanText(doc.title),
    description: cleanText(
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
    ),
    headings: headings(doc, textOf),
    sourceLanguage: sourceLanguage(doc),
  };
}
