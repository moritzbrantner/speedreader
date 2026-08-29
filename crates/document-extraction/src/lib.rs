use std::collections::BTreeMap;

use image_analysis_ocr::OcrPreset;
use lopdf::Document;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub const READING_DOCUMENT_VERSION: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingDocument {
    pub version: u8,
    pub text: String,
    pub pages: Vec<ExtractedPage>,
    pub diagnostics: Vec<CleanupDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedPage {
    pub page_number: u32,
    pub text: String,
    pub provenance: ExtractionProvenance,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ExtractionProvenance {
    EmbeddedText,
    CanonicalOcr { preset: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupDiagnostic {
    pub kind: CleanupDiagnosticKind,
    pub text: String,
    pub pages: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CleanupDiagnosticKind {
    RepeatedMarginArtifact,
    PageNumberArtifact,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageInput {
    pub page_number: u32,
    pub embedded_text: String,
}

pub trait CanonicalOcr {
    fn recognize_page(&self, page_number: u32) -> Result<String, ExtractionError>;
    fn preset(&self) -> OcrPreset;
}

#[derive(Debug, Error)]
pub enum ExtractionError {
    #[error("unable to parse PDF: {0}")]
    Pdf(#[from] lopdf::Error),
    #[error("canonical OCR failed for page {page_number}: {message}")]
    Ocr { page_number: u32, message: String },
}

pub fn inspect_pdf(pdf: &[u8]) -> Result<Vec<PageInput>, ExtractionError> {
    let document = Document::load_mem(pdf)?;
    document
        .get_pages()
        .into_keys()
        .map(|page_number| {
            let embedded_text = document.extract_text(&[page_number]).unwrap_or_default();
            Ok(PageInput {
                page_number,
                embedded_text,
            })
        })
        .collect()
}

/// Extract a reading document directly from PDF bytes.
///
/// The caller owns PDF page rendering and supplies the canonical OCR adapter;
/// embedded text stays on the deterministic, dependency-light path.
pub fn extract_pdf(
    pdf: &[u8],
    ocr: &impl CanonicalOcr,
) -> Result<ReadingDocument, ExtractionError> {
    extract_pages(inspect_pdf(pdf)?, ocr)
}

/// Create the shared reading-document contract from a plain-text source.
pub fn extract_text(text: &str) -> ReadingDocument {
    cleanup(vec![ExtractedPage {
        page_number: 1,
        text: normalize_whitespace(text),
        provenance: ExtractionProvenance::EmbeddedText,
    }])
}

pub fn extract_pages(
    pages: impl IntoIterator<Item = PageInput>,
    ocr: &impl CanonicalOcr,
) -> Result<ReadingDocument, ExtractionError> {
    let mut extracted = Vec::new();
    for page in pages {
        let normalized = normalize_whitespace(&page.embedded_text);
        let (text, provenance) = if normalized.is_empty() {
            let recognized = normalize_whitespace(&ocr.recognize_page(page.page_number)?);
            (
                recognized,
                ExtractionProvenance::CanonicalOcr {
                    preset: ocr.preset().as_str().to_string(),
                },
            )
        } else {
            (normalized, ExtractionProvenance::EmbeddedText)
        };
        extracted.push(ExtractedPage {
            page_number: page.page_number,
            text,
            provenance,
        });
    }
    Ok(cleanup(extracted))
}

fn cleanup(mut pages: Vec<ExtractedPage>) -> ReadingDocument {
    let margins = recurring_margin_lines(&pages);
    let mut diagnostics = Vec::new();
    for (line, page_numbers) in &margins {
        diagnostics.push(CleanupDiagnostic {
            kind: CleanupDiagnosticKind::RepeatedMarginArtifact,
            text: line.clone(),
            pages: page_numbers.clone(),
        });
    }

    for page in &mut pages {
        let mut retained = Vec::new();
        for line in page.text.lines() {
            if margins.contains_key(line) {
                continue;
            }
            if is_page_number(line) {
                diagnostics.push(CleanupDiagnostic {
                    kind: CleanupDiagnosticKind::PageNumberArtifact,
                    text: line.to_string(),
                    pages: vec![page.page_number],
                });
                continue;
            }
            retained.push(line);
        }
        page.text = retained.join("\n");
    }

    ReadingDocument {
        version: READING_DOCUMENT_VERSION,
        text: pages
            .iter()
            .map(|page| page.text.as_str())
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n"),
        pages,
        diagnostics,
    }
}

fn recurring_margin_lines(pages: &[ExtractedPage]) -> BTreeMap<String, Vec<u32>> {
    let mut occurrences: BTreeMap<String, Vec<u32>> = BTreeMap::new();
    for page in pages {
        let lines: Vec<_> = page.text.lines().collect();
        for line in lines.first().into_iter().chain(lines.last()) {
            let trimmed = line.trim();
            if !trimmed.is_empty() && !is_page_number(trimmed) {
                let page_numbers = occurrences.entry(trimmed.to_string()).or_default();
                if !page_numbers.contains(&page.page_number) {
                    page_numbers.push(page.page_number);
                }
            }
        }
    }
    occurrences.retain(|_, page_numbers| page_numbers.len() > 1);
    occurrences
}

fn normalize_whitespace(text: &str) -> String {
    text.lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_page_number(line: &str) -> bool {
    !line.is_empty() && line.chars().all(|character| character.is_ascii_digit())
}
