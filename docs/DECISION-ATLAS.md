# Decision Atlas

Speedreader's owner-approved product direction. This answers **what the product should do**, not how to implement it or whether an existing feature has passed acceptance.

- **[x] means owner-approved behavior**, not implemented or tested. **[ ] means an open Question**, which does not automatically block unrelated work.
- Keep Questions beside the product features they affect. The only semantic leaf kinds are Decisions and Questions; section headings are navigation.
- Every entry has an explicit, permanent ID. Never renumber or reuse it. Preserve answered Questions and link later Decisions with `Answers ID`; preserve revised intent through explicit `Supersedes ID` relationships.
- Only record consequential choices about the reading experience, supported inputs and outputs, and product behavior. Technical architecture belongs in `AGENTS.md`, implementation details in code and tests, and work or defects in GitHub issues.
- Do not infer approval or implementation success from existing code, closed issues or CI results.

## 1. Reading a document

- [x] **1.1** Offer focused speed-reading and full-document reading as connected views.
  Speedreader's default focused speed-reading view progressively presents centered words or short text chunks. Readers can also switch to a full-document view to read, browse, and regain context in the same document. Switching in either direction must preserve the current logical reading position without restarting, jumping to an unrelated passage or losing the place. The full-document view makes the current position findable, and navigating to another passage there lets focused speed-reading continue from the newly selected place. These are two modes of reading the same document, not separate copies. The full-document mode is a genuine reading surface, not merely the source-text editor. The exact visual presentation of imported document formatting remains Question 1.2.

- [ ] **1.2** [question] How should the full-document view represent imported content?
  For PDFs and webpages, should this be a source-faithful page/layout view, a clean reflowed document with useful headings and paragraphs, or a choice between both? Whichever mode is selected must respect the shared reading position defined in Decision 1.1.
