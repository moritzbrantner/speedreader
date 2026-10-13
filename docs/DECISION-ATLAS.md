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

- [x] **1.8** [question] What should focused reading do with ambiguously meaningful text?
  If extraction cannot confidently distinguish a genuine main-text passage from supplementary material, should focused playback include the uncertain passage to avoid losing meaningful content, omit it by default while keeping it accessible and correctable in document mode, or pause to request a user decision? This choice concerns uncertain regions, not confidently identified headings, captions or boilerplate under Decision 1.7, and does not change contextual pauses for non-prose content in Decision 1.5. Answered by 1.9.

- [x] **1.9** Include ambiguously meaningful passages by default rather than losing potentially important text.
  Answers 1.8 (owner selected A).
  If a PDF or webpage region might be meaningful main prose, a heading or a relevant caption but the extraction/classification cannot confidently distinguish it from supplementary material, keep that passage in focused speed-reading in a sensible document order by default. Prefer an occasional extra passage over silently omitting useful content. This is not a blanket inclusion of clearly identified footnotes, navigation, sidebars or repeated page furniture, which remain excluded from focused playback by default under Decision 1.7. Preserve source provenance, let users inspect the passage in the full-document view and correct inclusion through the existing user-override interaction. Do not interrupt playback merely to ask whether uncertain text should be read; meaningful non-prose images, tables, diagrams and equations still follow the contextual pause in Decision 1.5. No specific confidence algorithm or threshold is mandated, and owner approval does not establish current implementation or test acceptance.

- [x] **1.10** [question] Should focused playback pause when switching to the full-document view?
  If a reader enters the full-document view while focused speed-reading is actively advancing, should the focused playback pause immediately, continue advancing while the document position follows, or provide a user-configurable behavior? All options must preserve the shared logical reading position in Decisions 1.1 and 1.3; after a pause, returning to focused mode must not silently resume playback (Decision 1.5). Answered by 1.11.

- [x] **1.11** Automatically pause focused playback when entering the full-document view.
  Answers 1.10 (owner selected A).
  When a reader switches to full-document reading while focused speed-reading is playing, pause progression immediately and display the matching document passage at the same logical position. Entering document mode, switching between clean/original layouts, and returning to focused speed-reading must not automatically resume playback. Only an explicit Play action resumes it; switching views while already paused leaves playback paused. Preserve the document identity and shared reading position throughout. See Decisions 1.1, 1.3, and 1.5. This is approved product behavior, not evidence of implementation.

- [x] **1.12** [question] How should readers choose a different focused-reading position in the full-document view?
  Should tapping/clicking a passage move the shared reading position directly, should readers explicitly select a passage and use a "Continue from here" action, or should both methods be available? Scrolling through the document alone must not silently alter the focused reading position. Whichever interaction is chosen, returning to focused mode remains paused until an explicit Play action under Decision 1.11. Answered by 1.13.

- [x] **1.13** Reposition focused reading only after an explicit "Continue from here" action.
  Answers 1.12 (owner selected B).
  In the full-document view, readers can select a passage as a proposed new focused-reading starting point. Indicate the selected passage so they can verify their choice, then provide a clearly labeled "Continue from here" action to commit it. Scrolling, tapping or clicking to inspect content, and merely selecting a proposed passage must not alter the committed reading position or stored progress. Only the explicit confirmation changes the shared logical reading position; it must map to the corresponding focused-reading content in both clean and original layouts without losing document identity. The transition must remain paused until the reader explicitly presses Play under Decision 1.11. The button must also be usable by keyboard. This is approved product behavior, not a claim of implementation or successful acceptance.

- [x] **1.14** [question] Where should readers land after confirming "Continue from here"?
  After choosing a passage and pressing "Continue from here", should Speedreader switch immediately to the focused speed-reading view (remaining paused until Play), stay in full-document mode with the new position indicated, or let readers choose this behavior? This concerns view navigation only: Decision 1.13 governs explicit position confirmation, and Decision 1.11 prohibits automatic playback. Answered by 1.15.

- [x] **1.15** Make the post-confirmation view a reader preference.
  Answers 1.14 (owner selected C).
  Provide a user-controlled, persistent preference for what happens after the reader confirms a different passage using "Continue from here": either switch immediately to focused speed-reading at the confirmed passage or remain in the full-document view with the new position visibly indicated. Both outcomes commit the same logical reading position, preserve the same document identity, and keep playback paused until the reader explicitly presses Play (Decision 1.11). Switching between clean/original layouts does not override the chosen preference. This is a behavior preference, not another confirmation prompt or an instruction to introduce a parallel reader. The initial default preference is not yet owner-approved and is Question 1.16.

- [x] **1.16** [question] What is the default post-confirmation view for new readers?
  Under Decision 1.15 both outcomes are configurable, but which should be the initial preference: switch to focused speed-reading (paused, ready for Play), or stay in the full-document reading view (with the confirmed position highlighted)? Choosing the default does not remove either option or permit automatic playback. Answered by 1.17.

- [x] **1.17** Default to the paused focused view after "Continue from here".
  Answers 1.16 (owner selected A).
  For new readers who have not chosen a different post-confirmation destination, pressing "Continue from here" commits the explicitly selected passage and switches to focused speed-reading at that position, **paused** and ready for an explicit Play action. Readers can change the persistent preference defined by Decision 1.15 to remain in full-document mode instead. Neither option automatically plays, resets progress, nor loses the shared document position under Decisions 1.11 and 1.13.

## 2. Document library

- [x] **2.1** [question] What should happen to imported documents after a reading session?
  Beyond preserving the current reading position, should Speedreader present only a short list of recent documents, provide a persistent searchable library for saved documents, or primarily treat imports as one-off sessions with no permanent library? Existing code has recent-document persistence, but implementation alone is not an owner-approved product choice. The core reading workflow remains usable without accounts or a backend. Answered by 2.2.

- [x] **2.2** Provide a persistent, searchable personal document library.
  Answers 2.1 (owner selected B).
  Readers can keep documents in a personal library beyond the most recent reading sessions, find saved documents through search, organize their collection, remove documents they no longer want, and reopen any saved document with its own remembered reading progress. This applies to supported reading inputs such as pasted text, PDFs and webpages and complements the synchronized reading views in Section 1. Library contents and progress persist across application restarts on the device and must remain usable without an account or cloud service. Do not impose the current limited recent-document history as the intended library size. How imports become saved library items and the specific organization interaction remain product choices to refine; do not infer these from existing persistence code. This is approved product direction, not proof that library browsing, search, organization or removal already works.

- [x] **2.3** [question] When should an imported document be saved to the personal library?
  Should all successfully imported documents be added automatically, should readers explicitly choose Save to Library, or should a user preference control automatic saving? Regardless of this choice, a one-off reading session must remain usable when durable storage is unavailable, and saved documents must support removal under Decision 2.2. Answered by 2.4.

- [x] **2.4** Automatically add successfully imported documents to the personal library.
  Answers 2.3 (owner selected A).
  After a successful import or explicit opening of a supported document for reading, save that document to the persistent personal library automatically. Readers do not have to press an extra "Save to Library" button or enable an opt-in setting before saved documents can be found again. Saved documents remain searchable, organizable and removable, with their own reading progress, as established by Decision 2.2. A failed import must not be presented as successfully saved; inability to persist must be communicated honestly while allowing the immediate reading session to continue where possible. This includes PDFs, webpages and documents opened from plain text, without treating each keystroke in an editable text field as a new document import. The user did not mandate cloud accounts, synchronous uploads, an exact library storage schema, a deduplication algorithm, or a specific organization UI.

- [x] **2.5** [question] How should readers organize their saved document library?
  Should documents be organized primarily in folders, with flexible tags, or with both folders and tags? Each option retains the approved searchable library and per-document progress; the repository should not infer a specific organization model from its existing recent-documents implementation. Answered by 2.6.

- [x] **2.6** Organize the personal document library using tags.
  Answers 2.5 (owner selected B).
  Readers can create and manage their own tags, assign one or more tags to a saved document, remove or change a document's tags, and find documents by filtering on tags. The same document can appear under multiple tags without being duplicated or losing its identity or per-document reading progress. Tags are the primary organization mechanism; do not require a folder hierarchy. Untagged documents must remain accessible in the library, and deleting or changing a tag must not delete its documents. Reuse the persistent personal library from Decision 2.2 and the automatic-save behavior from Decision 2.4. No automatic tagging, hierarchical tagging scheme or particular storage implementation is mandated.

- [x] **2.7** [question] What should the personal library's search cover?
  Should library search match document titles and assigned tags only, or also find words and phrases inside the saved documents' content? Both options preserve tag filtering, document identity and saved progress under Decisions 2.2 and 2.6. Answered by 2.8.

- [x] **2.8** Search document titles, tags and saved document content.
  Answers 2.7 (owner selected B).
  The personal library supports searching the titles and assigned tags of saved documents as well as words and phrases occurring anywhere in their saved readable text. A matching document must be discoverable even when the search terms do not appear in its title or tags, while tag-based filtering from Decision 2.6 remains available. Searches use locally saved documents without requiring a cloud account, upload or repeated remote import, and search must not silently discard documents because they exceed the original ten-item recent history. A search result identifies the corresponding saved document without modifying its reading position or progress merely because it matched. The interaction for opening a match is still a product choice in Question 2.9. This Decision establishes product behavior, not a particular search index, ranking algorithm, external provider or claim of implementation.

- [x] **2.9** [question] What should happen when a reader opens a full-text search match?
  Should the app show the matching passage in full-document mode without changing saved reading progress, or first open the document at its last saved reading position with the search match available to inspect separately? In either case, inspecting a result must not move the committed focused-reading position; Decisions 1.11 and 1.13 require paused playback and an explicit "Continue from here" confirmation before seeking to a newly selected passage. Answered by 2.10.

- [x] **2.10** Open full-text search matches in document context without moving reading progress.
  Answers 2.9 (owner selected A).
  When a reader opens a search result matching text inside a saved document, open that document in its full-document reading view at the matching passage and make the match recognizable in context. This is navigation for inspection, not a change of the committed focused speed-reading position or its saved progress. Playback remains paused. Scrolling or inspecting further matches never silently seeks the focused reader; starting focused reading at a match requires explicitly selecting that passage and confirming "Continue from here" under Decision 1.13, followed by a separate Play action under Decision 1.11. Respect the clean/original document layout availability in Decision 1.3 and do not pretend an unavailable source location is an exact match. Reopening for normal reading must still offer access to the original saved progress.

## 3. Web app layout and navigation

- [ ] **3.1** [question] How should the library and reader be arranged in the web app?
  Should opening Speedreader lead directly to the focused reader with library/import access nearby, lead to a library/home screen from which a dedicated reading workspace opens, or use a combined desktop workspace with a persistent library sidebar next to the reader (collapsing to distinct views on mobile)? All options must provide quick importing and switching between focused and full-document reading, without overwhelming the reading area with extraction diagnostics or settings. This question concerns the user-visible workspace, not an assumption that the current single-page UI is the intended product design.
