# Decision Atlas

Speedreader's owner-approved product direction. This answers **what the product should do**, not how to implement it or whether an existing feature has passed acceptance.

- **[x] means settled owner-approved behavior or an answered historical Question**, not implemented or tested. **[ ] means an unanswered Question**, which does not automatically block unrelated work.
- Keep Questions beside the product features they affect. The only semantic leaf kinds are Decisions and Questions; section headings are navigation.
- Every entry has an explicit, permanent ID. Never renumber or reuse it. Preserve answered Questions and link later Decisions with `Answers ID`; preserve revised intent through explicit `Supersedes ID` relationships.
- Only record consequential choices about the reading experience, supported inputs and outputs, and product behavior. Technical architecture belongs in `AGENTS.md`, implementation details in code and tests, and work or defects in GitHub issues.
- Do not infer approval or implementation success from existing code, closed issues or CI results.

## 1. Reading a document

- [x] **1.1** Offer focused speed-reading and full-document reading as connected views.
  Speedreader's default focused speed-reading view progressively presents centered words or short text chunks. Readers can also switch to a full-document view to read, browse, and regain context in the same document. Switching in either direction must preserve the current logical reading position without restarting, jumping to an unrelated passage or losing the place. The full-document view makes the current position findable, and navigating to another passage there lets focused speed-reading continue from the newly selected place. These are two modes of reading the same document, not separate copies. The full-document mode is a genuine reading surface, not merely the source-text editor. Document layout choices are defined by Decision 1.3 (Answers 1.2).

- [x] **1.2** [question] How should the full-document view represent imported content?
  For PDFs and webpages, should this be a source-faithful page/layout view, a clean reflowed document with useful headings and paragraphs, or a choice between both? Whichever mode is selected must respect the shared reading position defined in Decision 1.1. Answered by 1.3.

- [x] **1.3** Provide both clean and original document layouts, with one-button switching.
  Answers 1.2 (owner selected C).
  Within the full-document reading view, offer both a clean, reflowed layout with meaningful headings and paragraphs and the original document layout, retaining original pages, images and formatting where available. A single, directly accessible button toggles between the two document layouts without a multi-step mode selector. Both remain views of the same document and retain its logical reading position when toggled; the reader can move to a different passage in either layout and return to focused speed-reading at that passage under Decision 1.1. This two-layout toggle is separate from the control for entering or leaving focused speed-reading. When a source-faithful layout cannot be provided, clearly state that it is unavailable rather than simulating a misleading original. The editable source-text field is not a substitute for either document reading layout.

- [x] **1.4** [question] How should focused speed-reading handle non-prose content?
  When the source contains a meaningful image, table, diagram or equation that cannot faithfully fit the centered word/phrase display, should speed-reading pause and present that content in the synchronized document view, attempt a meaningful text rendering while continuing, or skip it with a visible indication? Do not treat an image or table as implicitly discarded just because it has no ordinary reading chunk. Answered by 1.5.

- [x] **1.5** Pause for non-prose content and show its document context.
  Answers 1.4 (owner selected A).
  When focused speed-reading reaches a meaningful image, table, diagram or equation that cannot be presented faithfully as a word or short phrase, automatically pause progression and bring the corresponding element into view in the synchronized full-document reading surface defined in 1.1 and 1.3. Keep the same document and logical reading position, with the element in context rather than silently skipping or flattening it into misleading words. After reviewing, the reader can deliberately resume focused speed-reading from the appropriate next position; switching representations by itself must not silently resume playback. Where the actual source element cannot be displayed, make the limitation explicit instead of pretending to show it. This is a user-facing reading-mode behavior, not a mandate for a new extraction pipeline. This decision does not claim that non-prose element detection is already implemented.

- [x] **1.6** [question] Which document text belongs in focused speed-reading by default?
  When importing a PDF or webpage with headings, captions, footnotes, sidebars and page headers or footers, should focused reading include only main prose, include meaningful headings and captions while leaving supplemental text accessible in document mode, or read all extracted text in source order? Content excluded from focused playback must remain accessible in the full-document view; non-prose images, tables, diagrams and equations follow Decision 1.5. Answered by 1.7.

- [x] **1.7** Focused reading selects meaningful prose, headings and captions.
  Answers 1.6 (owner selected B).
  For imported PDFs and webpages, focused speed-reading includes the main narrative/prose plus headings and captions that contribute meaning or needed context, in a sensible reading order. Footnotes, sidebars, repetitive page headers/footers and page numbers are excluded from focused playback by default, but remain available in the full-document reading experience from Decisions 1.1 and 1.3. Selection must consider actual document structure and content, not simply assume every region's current role label or extraction default is correct; repeated boilerplate must not interrupt reading, while a misclassified meaningful passage must not be silently discarded without a way to inspect and correct the selection. Keep source provenance and existing user inclusion overrides intact. The quality of this selection must be demonstrated against independently defined expected reading content from representative real PDFs and webpages, including difficult layouts and imperfect extraction; a passing role-filter unit test alone is insufficient. Images, tables, diagrams and equations follow the contextual pause behavior in Decision 1.5. The Atlas defines the reading behavior and observable outcome, not a required classification algorithm or claim that it is implemented.
