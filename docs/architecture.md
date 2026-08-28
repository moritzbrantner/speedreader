# Architecture

## Product shape

```text
                         packages/speed-reading
                         core + React behavior
                                  ^
                    +-------------+-------------+
                    |             |             |
                 Next.js        Expo         Tauri
                    |                           |
                    |                      native adapters
                    |                           |
                    +----------> Rust server    |
                                   |            |
                                   +-----+------+
                                         |
                              document-extraction (A2)
                                         |
                              visual-analysis OCR owner
```

A0 implements only the top half and the empty Rust server seam.

## Reader boundary

The reader accepts text and reading options and produces deterministic chunks/pivot metadata. React owns scheduling in A0. A1 will move session transitions into a deterministic headless session while leaving the pure chunking/timing functions intact.

The same fixture text is imported by web and mobile to make accidental platform drift obvious.

## Document boundary

A later `ReadingDocument` contract will be the handoff from extraction to reading. The reader must not know whether that document came from pasted text, a PDF text layer, OCR, a desktop file, or a remote extraction service.

PDF/OCR strategy belongs below that contract. Model/provider names must not leak into reader state.

## Platform presentation

Web and desktop deliberately share the Next.js presentation because Tauri can embed a static export. Expo does not share DOM components; it renders the shared behavior through React Native components.

This is intentional duplication at the presentation edge in exchange for one behavior model.
