import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { textSlots } from "../../domain/block/block-translation";
import type { InlineNode } from "../../domain/block/inline-node";
import { BlockId } from "../../domain/block/value-objects/block-id.vo";
import { reflowLines } from "../../domain/markup/comment-reflow";
import { toMarkup } from "../../domain/markup/markup";
import { BlockReader, type ReadBlock } from "./block-reader";

const fixture = async (name: string): Promise<Document> => {
  const html = await readFile(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8");

  return new DOMParser().parseFromString(html, "text/html");
};

const htmlDocument = (body: string): Document =>
  new DOMParser().parseFromString(`<!doctype html><html><body>${body}</body></html>`, "text/html");

const readerFor = (doc: Document): BlockReader => {
  let next = 0;

  return new BlockReader(doc, () => {
    next += 1;

    return BlockId.create(`b${next}`).getValue();
  });
};

const textOf = (read: ReadBlock): string => textSlots(read.block.nodes).join("").trim();

const blockWithText = (reads: ReadBlock[], text: string): ReadBlock | undefined =>
  reads.find((read) => textOf(read).includes(text));

const topLevelKinds = (nodes: InlineNode[]): string[] => nodes.map((node) => node.kind);

describe("BlockReader on the GitHub fixture", () => {
  test("finds_headings_paragraphs_and_list_items", async () => {
    const doc = await fixture("github-fork-a-repo.html");

    const reads = readerFor(doc).read(doc);

    expect(reads.length).toBeGreaterThan(20);
    expect(reads.some((read) => textOf(read) === "Fork a repository")).toBe(true);
    expect(blockWithText(reads, "lets you propose changes to a project")).toBeDefined();
  });

  test("no_block_scope_is_inside_pre_code_kbd_samp_or_svg", async () => {
    const doc = await fixture("github-fork-a-repo.html");

    const reads = readerFor(doc).read(doc);

    const inside = reads
      .flatMap((read) => [...read.scope, ...read.textNodes])
      .filter((node) => {
        const parent = node.parentElement;

        return parent?.closest("pre, code, kbd, samp, svg") !== null;
      });

    expect(inside.length).toBe(0);
  });

  test("inline_code_becomes_an_atom_and_its_node_is_the_original_node", async () => {
    const doc = await fixture("github-fork-a-repo.html");
    const code = [...doc.querySelectorAll("p code")].find(
      (el) => el.textContent === "gh repo fork",
    );

    const reads = readerFor(doc).read(doc);

    const owner = reads.find((read) => [...read.atoms.values()].some((node) => node === code));

    expect(code).toBeDefined();
    expect(owner).toBeDefined();
    expect(topLevelKinds(owner?.block.nodes ?? [])).toContain("atom");
    expect(owner && textOf(owner)).not.toContain("gh repo fork");
  });

  test("link_whose_text_is_a_url_is_an_atom_and_ordinary_link_is_a_group", async () => {
    const doc = await fixture("github-fork-a-repo.html");
    const links = [...doc.querySelectorAll("p a")];
    const pathLink = links.find((el) => el.textContent === "octocat/Spoon-Knife");
    const ordinaryLink = links.find((el) => el.textContent === "About forks");

    const reads = readerFor(doc).read(doc);

    const atoms = reads.flatMap((read) => [...read.atoms.values()]);
    const groups = reads.flatMap((read) => [...read.groups.values()]);

    expect(pathLink).toBeDefined();
    expect(ordinaryLink).toBeDefined();
    expect(atoms.some((node) => node === pathLink)).toBe(true);
    expect(groups.some((node) => node === ordinaryLink)).toBe(true);
  });

  test("second_read_of_the_same_root_returns_no_duplicates", async () => {
    const doc = await fixture("github-fork-a-repo.html");
    const reader = readerFor(doc);

    const first = reader.read(doc);
    const second = reader.read(doc);

    expect(first.length).toBeGreaterThan(0);
    expect(second.map(textOf)).toEqual([]);
  });

  test("read_does_not_mutate_the_document", async () => {
    const doc = await fixture("github-fork-a-repo.html");
    const before = doc.documentElement.outerHTML;

    readerFor(doc).read(doc);

    expect(doc.documentElement.outerHTML).toBe(before);
  });
});

describe("BlockReader exclusions", () => {
  test("translate_no_and_notranslate_are_excluded", () => {
    const doc = htmlDocument(
      `<p>Open the <span translate="no">Lambe Panel</span> menu.</p>
       <div class="notranslate"><p>Brand name stays</p></div>
       <section translate="no"><h2>Frozen heading</h2></section>
       <p>Keep <b class="notranslate">Octocat</b> as is.</p>`,
    );

    const reads = readerFor(doc).read(doc);

    const texts = reads.map(textOf);

    expect(texts).toEqual(["Open the  menu.", "Keep  as is."]);
    expect(reads[0]?.atoms.get(1)).toBe(doc.querySelector("span[translate]") ?? undefined);
  });

  test("runs_without_a_letter_are_ignored", () => {
    const doc = htmlDocument("<p>42 %</p><p>- 2026 -</p><p>Fork it</p>");

    const reads = readerFor(doc).read(doc);

    expect(reads.map(textOf)).toEqual(["Fork it"]);
  });
});

describe("BlockReader on highlighted code", () => {
  test("highlighted_comment_in_pre_is_a_block_with_marker_split_and_plain_code_is_not", async () => {
    const doc = await fixture("react-like-page.html");
    const comment = doc.querySelector("pre .pl-c");

    const reads = readerFor(doc).read(doc);

    const inPre = reads.filter((read) =>
      read.scope.some((node) => node.parentElement?.closest("pre")),
    );
    const hash = inPre.find((read) => read.scope[0] === comment);
    const body = hash?.textNodes[0];

    expect(inPre).toHaveLength(2);
    expect(hash?.block.nodes).toEqual([{ kind: "text", text: "fetch the upstream branches" }]);
    expect(body && hash?.commentAffixes.get(body)).toEqual({
      prefix: " ",
      suffix: "",
      separators: [],
      lineLengths: [27],
    });
    expect(reads.some((read) => textOf(read).includes("git push"))).toBe(false);
    expect(reads.some((read) => textOf(read).includes("git fetch"))).toBe(false);
  });

  test("multi_line_comment_is_one_sentence_and_inner_markers_stay_out_of_the_body", async () => {
    const doc = await fixture("react-like-page.html");

    const reads = readerFor(doc).read(doc);

    const merge = blockWithText(reads, "merge the default branch");
    const text = merge?.textNodes[0];
    const affix = text && merge?.commentAffixes.get(text);

    expect(merge?.block.nodes).toEqual([
      { kind: "text", text: "merge the default branch into your local copy" },
    ]);
    expect(affix).toEqual({
      prefix: "/* ",
      suffix: " */",
      separators: ["\n * "],
      lineLengths: [24, 20],
    });

    const lines = affix
      ? reflowLines("merge the default branch into your local copy", affix.lineLengths)
      : [];
    const rebuilt = affix
      ? `${affix.prefix}${lines.map((line, index) => `${line}${affix.separators[index] ?? ""}`).join("")}${affix.suffix}`
      : "";

    expect(rebuilt).toBe(text?.nodeValue ?? "");
  });

  test("comment_in_code_under_notranslate_or_translate_no_is_still_read", () => {
    const doc = htmlDocument(
      `<div class="highlight notranslate"><pre><span class="pl-c"># fetch the upstream branches</span>
git fetch</pre></div>
       <pre translate="no"><code><span class="hljs-comment">// merge the changes</span></code></pre>`,
    );

    const reads = readerFor(doc).read(doc);

    expect(reads.map(textOf)).toEqual(["fetch the upstream branches", "merge the changes"]);
  });

  test("comment_under_contenteditable_or_hard_exclusion_is_never_read", () => {
    const doc = htmlDocument(
      `<div contenteditable="true"><pre><span class="cm-comment">// user typed this</span></pre></div>
       <textarea>// draft</textarea>
       <div translate="no"><svg><foreignObject><pre><span class="pl-c"># in svg</span></pre></foreignObject></svg></div>`,
    );
    const reader = readerFor(doc);
    const editable = doc.querySelector("[contenteditable] pre");

    expect(reader.read(doc).map(textOf)).toEqual([]);
    expect(editable && reader.read(editable).map(textOf)).toEqual([]);
  });

  test("blank_interior_comment_line_stays_blank_and_separators_are_kept", () => {
    const doc = htmlDocument(
      '<pre><span class="hljs-comment">/* first para here\n *\n * second para here */</span></pre>',
    );

    const [read] = readerFor(doc).read(doc);
    const text = read?.textNodes[0];
    const affix = text && read?.commentAffixes.get(text);
    const lines = affix
      ? reflowLines("premier paragraphe second paragraphe", affix.lineLengths)
      : [];
    const rebuilt = affix
      ? `${affix.prefix}${lines.map((line, index) => `${line}${affix.separators[index] ?? ""}`).join("")}${affix.suffix}`
      : "";

    expect(read?.block.nodes).toEqual([{ kind: "text", text: "first para here second para here" }]);
    expect(affix?.lineLengths).toEqual([15, 0, 16]);
    expect(rebuilt).toBe("/* premier paragraphe\n *\n * second paragraphe */");
  });

  test("code_container_whose_class_mentions_comment_is_not_a_comment", () => {
    const doc = htmlDocument(
      '<pre class="comment-box">const x = 1; // set the value</pre><code class="comment">let y = 2;</code>',
    );

    const reads = readerFor(doc).read(doc);

    expect(reads.map(textOf)).toEqual([]);
  });
});

describe("BlockReader text and claims", () => {
  test("no_break_spaces_survive_whitespace_collapse", () => {
    const doc = htmlDocument("<p>Press Ctrl\u00a0+\u00a0C, 10\u202fMB\n   now</p>");

    const reads = readerFor(doc).read(doc);

    expect(reads.map(textOf)).toEqual(["Press Ctrl\u00a0+\u00a0C, 10\u202fMB now"]);
  });

  test("sub_root_read_after_the_document_returns_no_claimed_text", () => {
    const doc = htmlDocument("<p>Use the <b>fork <i>button</i></b> now.</p>");
    const reader = readerFor(doc);
    const bold = doc.querySelector("b");
    const italic = doc.querySelector("i");

    const first = reader.read(doc);

    expect(first.map(textOf)).toEqual(["Use the fork button now."]);
    expect(bold && reader.read(bold).map(textOf)).toEqual([]);
    expect(italic && reader.read(italic).map(textOf)).toEqual([]);
  });

  test("document_read_after_a_sub_root_skips_runs_with_claimed_text", () => {
    const doc = htmlDocument("<p>Use the <b>fork</b> now.</p><p>Second paragraph</p>");
    const reader = readerFor(doc);
    const bold = doc.querySelector("b");

    const first = bold ? reader.read(bold) : [];
    const second = reader.read(doc);

    expect(first.map(textOf)).toEqual(["fork"]);
    expect(second.map(textOf)).toEqual(["Second paragraph"]);
  });

  test("datalist_option_and_head_are_not_read", () => {
    const doc = new DOMParser().parseFromString(
      '<html><head><title>Page title</title></head><body><datalist id="x"><option>Hidden choice</option></datalist><p>Visible text</p></body></html>',
      "text/html",
    );
    const reader = readerFor(doc);

    expect(reader.read(doc.head).map(textOf)).toEqual([]);
    expect(reader.read(doc).map(textOf)).toEqual(["Visible text"]);
  });
});

const roleOf = (reads: ReadBlock[], text: string): string | undefined =>
  blockWithText(reads, text)?.block.role;

describe("BlockReader roles", () => {
  test("nav_header_aside_and_role_landmarks_are_chrome", () => {
    const doc = htmlDocument(
      '<header><span>Site name here</span></header><nav><span>Products overview</span></nav><aside>Related reading</aside><div role="toolbar">Bold and italic</div><div role="search">Search the docs</div><footer>Copyright notice</footer><label>Your email</label><main><p>Body text</p></main>',
    );

    const reads = readerFor(doc).read(doc);

    for (const text of [
      "Site name here",
      "Products overview",
      "Related reading",
      "Bold and italic",
      "Search the docs",
      "Copyright notice",
      "Your email",
    ])
      expect(roleOf(reads, text)).toBe("chrome");

    expect(roleOf(reads, "Body text")).toBe("content");
  });

  test("article_header_is_article_and_section_footer_is_content", () => {
    const doc = htmlDocument(
      "<article><header><h1>Release notes</h1></header><p>What changed</p></article><main><section><footer>Section summary</footer></section></main>",
    );

    const reads = readerFor(doc).read(doc);

    expect(roleOf(reads, "Release notes")).toBe("article");
    expect(roleOf(reads, "What changed")).toBe("article");
    expect(roleOf(reads, "Section summary")).toBe("content");
  });

  test("block_made_only_of_links_is_chrome", () => {
    const doc = htmlDocument(
      '<main><div><a href="/a">Home</a> <a href="/b">Guides</a></div><p><button>Show more</button></p></main>',
    );

    const reads = readerFor(doc).read(doc);

    expect(roleOf(reads, "Home")).toBe("chrome");
    expect(roleOf(reads, "Show more")).toBe("chrome");
  });

  test("paragraph_with_an_inline_link_is_content", () => {
    const doc = htmlDocument(
      '<main><p>Read the <a href="/guide">setup guide</a> first.</p></main>',
    );

    const reads = readerFor(doc).read(doc);

    expect(roleOf(reads, "setup guide")).toBe("content");
  });

  test("markdown_body_is_article_and_goes_before_other_content", async () => {
    const doc = await fixture("repo-blob-readme.html");

    const reads = readerFor(doc).read(doc);

    expect(roleOf(reads, "Widget is a small library")).toBe("article");
    expect(roleOf(reads, "Incremental redraws")).toBe("article");
    expect(roleOf(reads, "128 lines")).toBe("content");

    for (const text of ["Pull requests", "README.md", "Raw", "Edit", "main", "Document the retry"])
      expect(roleOf(reads, text)).toBe("chrome");
  });
});

describe("BlockReader on visually hidden text", () => {
  test("text_under_display_none_or_visibility_hidden_is_not_a_block", () => {
    const doc = htmlDocument(
      '<main><div style="display: none"><p>Collapsed menu entry</p></div><p style="visibility: hidden">Invisible label</p><p hidden>Hidden attribute text</p><p>Shown paragraph</p></main>',
    );

    const texts = readerFor(doc).read(doc).map(textOf);

    expect(texts).toEqual(["Shown paragraph"]);
  });

  test("aria_hidden_text_still_shown_on_screen_is_a_block", () => {
    const doc = htmlDocument(
      '<main><div aria-hidden="true"><p>Decorative tagline</p></div><p>Shown paragraph</p></main>',
    );

    const texts = readerFor(doc).read(doc).map(textOf);

    expect(texts).toEqual(["Decorative tagline", "Shown paragraph"]);
  });

  test("screen_reader_only_text_is_not_a_block_by_class_or_computed_clip", () => {
    const doc = htmlDocument(
      '<style>.toggle-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(1px,1px,1px,1px)}.skip-label{position:absolute;clip-path:inset(50%)}</style><main><h2>History<span class="toggle-label">Toggle History subsection</span></h2><p class="sr-only">Only for readers one</p><p class="visually-hidden">Only for readers two</p><p class="screen-reader-text">Only for readers three</p><p class="skip-label">Skip to content</p><p>Shown paragraph</p></main>',
    );

    const texts = readerFor(doc).read(doc).map(textOf);

    expect(texts).toEqual(["History", "Shown paragraph"]);
  });

  test("edit_section_links_are_left_out_of_the_heading", () => {
    const doc = htmlDocument(
      '<main><h2>Geography<span class="mw-editsection"><span>[</span><a href="?action=edit">edit</a><span>]</span></span></h2></main>',
    );

    const texts = readerFor(doc).read(doc).map(textOf);

    expect(texts).toEqual(["Geography"]);
  });
});

describe("BlockReader roles of low value regions", () => {
  test("reference_lists_and_endnotes_are_chrome", () => {
    const doc = htmlDocument(
      '<main><p>Body text</p><div class="mw-references-wrap"><ol class="references"><li>Smith 2004, p. 12</li></ol></div><div class="reflist"><p>Jones 1999</p></div><section role="doc-endnotes"><ol><li>Endnote source</li></ol></section></main>',
    );

    const reads = readerFor(doc).read(doc);

    for (const text of ["Smith 2004", "Jones 1999", "Endnote source"])
      expect(roleOf(reads, text)).toBe("chrome");

    expect(roleOf(reads, "Body text")).toBe("content");
  });

  test("navboxes_are_chrome", () => {
    const doc = htmlDocument(
      '<main><p>Body text</p><div class="navbox"><table><tr><th>Cities of California</th><td>Long Beach and Pasadena</td></tr></table></div></main>',
    );

    const reads = readerFor(doc).read(doc);

    expect(roleOf(reads, "Cities of California")).toBe("chrome");
    expect(roleOf(reads, "Long Beach and Pasadena")).toBe("chrome");
  });
});

const shapeOf = (body: string): string => {
  const doc = htmlDocument(body);
  const [read] = readerFor(doc).read(doc);

  return toMarkup(read?.block.nodes ?? []).replace(/(<\/?[gx])\d+/g, "$1");
};

describe("BlockReader markup weight", () => {
  test("whitespace_only_and_hidden_empty_inline_elements_cost_no_tag", () => {
    const shape = shapeOf(
      '<p>Hello<span> </span>world<span class="sep">\u00a0</span><link href="/x"> <b>now</b></p>',
    );

    expect(shape).toBe("Hello world\u00a0 <g>now</g>");
  });

  test("nested_groups_without_text_of_their_own_collapse_into_one", () => {
    const shape = shapeOf(
      '<p>See <span class="nowrap"><a href="/page"><b>the page</b></a></span> now.</p>',
    );

    expect(shape).toBe("See <g>the page</g> now.");
  });

  test("plain_wrappers_are_dropped_while_links_emphasis_code_and_hidden_text_keep_their_tags", () => {
    const shape = shapeOf(
      '<p><a href="/a">Link</a><span class="geo">34.05</span><em>stress</em> and <span>plain</span> text <code>x()</code> <span class="note">kept</span> here <span style="display:none">hidden</span></p>',
    );

    expect(shape).toBe("<g>Link</g>34.05<g>stress</g> and plain text <x/> <g>kept</g> here <x/>");
  });
});
