use std::collections::{BTreeMap, BTreeSet};

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
    /// Source lines retained with their structural classification, including lines
    /// excluded from the speed-reading projection.
    pub regions: Vec<DocumentTextRegion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTextRegion {
    /// Zero-based line index in the normalized source page before filtering.
    pub source_line_index: u32,
    pub text: String,
    pub role: DocumentTextRole,
    /// Confidence in the structural role. Unclassified reading content has no score.
    pub confidence: Option<u8>,
    pub evidence: Vec<DocumentTextEvidence>,
    pub include_in_reading: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentTextRole {
    /// Reading content that has not yet been assigned a more specific semantic role.
    Content,
    Header,
    Footer,
    PageNumber,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentTextEvidence {
    TopMargin,
    BottomMargin,
    RepeatedAcrossPages,
    NumericOnly,
    SequentialPageNumber,
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
        regions: Vec::new(),
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
            regions: Vec::new(),
        });
    }
    Ok(cleanup(extracted))
}

fn cleanup(mut pages: Vec<ExtractedPage>) -> ReadingDocument {
    let page_numbers = sequential_page_number_lines(&pages);
    let headers = recurring_margin_lines(&pages, MarginPosition::Top, &page_numbers);
    let footers = recurring_margin_lines(&pages, MarginPosition::Bottom, &page_numbers);
    let mut diagnostics = repeated_margin_diagnostics(&headers, &footers);

    for page in &mut pages {
        let lines = page
            .text
            .lines()
            .map(str::to_string)
            .collect::<Vec<String>>();
        let mut regions = Vec::with_capacity(lines.len());

        for (line_index, line) in lines.iter().enumerate() {
            let page_number_line = page_numbers
                .get(&page.page_number)
                .is_some_and(|indices| indices.contains(&line_index));
            let header = headers
                .get(line)
                .is_some_and(|occurrences| occurrences.contains(&(page.page_number, line_index)));
            let footer = footers
                .get(line)
                .is_some_and(|occurrences| occurrences.contains(&(page.page_number, line_index)));

            let (role, confidence, evidence, include_in_reading) = if page_number_line {
                let position = margin_position_evidence(line_index, lines.len());
                diagnostics.push(CleanupDiagnostic {
                    kind: CleanupDiagnosticKind::PageNumberArtifact,
                    text: line.clone(),
                    pages: vec![page.page_number],
                });
                (
                    DocumentTextRole::PageNumber,
                    Some(100),
                    vec![
                        position,
                        DocumentTextEvidence::NumericOnly,
                        DocumentTextEvidence::SequentialPageNumber,
                    ],
                    false,
                )
            } else if header {
                (
                    DocumentTextRole::Header,
                    Some(90),
                    vec![
                        DocumentTextEvidence::TopMargin,
                        DocumentTextEvidence::RepeatedAcrossPages,
                    ],
                    false,
                )
            } else if footer {
                (
                    DocumentTextRole::Footer,
                    Some(90),
                    vec![
                        DocumentTextEvidence::BottomMargin,
                        DocumentTextEvidence::RepeatedAcrossPages,
                    ],
                    false,
                )
            } else {
                (DocumentTextRole::Content, None, Vec::new(), true)
            };

            regions.push(DocumentTextRegion {
                source_line_index: line_index as u32,
                text: line.clone(),
                role,
                confidence,
                evidence,
                include_in_reading,
            });
        }

        page.text = regions
            .iter()
            .filter(|region| region.include_in_reading)
            .map(|region| region.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        page.regions = regions;
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

#[derive(Debug, Clone, Copy)]
enum MarginPosition {
    Top,
    Bottom,
}

fn sequential_page_number_lines(pages: &[ExtractedPage]) -> BTreeMap<u32, BTreeSet<usize>> {
    let mut matches: BTreeMap<u32, BTreeSet<usize>> = BTreeMap::new();

    for position in [MarginPosition::Top, MarginPosition::Bottom] {
        let candidates = pages
            .iter()
            .filter_map(|page| {
                let lines = page.text.lines().collect::<Vec<_>>();
                let (line_index, line) = margin_line(&lines, position, None)?;
                let value = line.parse::<i64>().ok()?;
                Some((page.page_number, line_index, value))
            })
            .collect::<Vec<_>>();

        if candidates.len() < 2 || !is_sequential_page_number_run(&candidates) {
            continue;
        }

        for (page_number, line_index, _) in candidates {
            matches.entry(page_number).or_default().insert(line_index);
        }
    }

    matches
}

fn is_sequential_page_number_run(candidates: &[(u32, usize, i64)]) -> bool {
    candidates.windows(2).all(|window| {
        let (first_page, _, first_value) = window[0];
        let (second_page, _, second_value) = window[1];
        second_value - first_value == i64::from(second_page) - i64::from(first_page)
    })
}

fn recurring_margin_lines(
    pages: &[ExtractedPage],
    position: MarginPosition,
    excluded: &BTreeMap<u32, BTreeSet<usize>>,
) -> BTreeMap<String, Vec<(u32, usize)>> {
    let mut occurrences: BTreeMap<String, Vec<(u32, usize)>> = BTreeMap::new();

    for page in pages {
        let lines = page.text.lines().collect::<Vec<_>>();
        let excluded_indices = excluded.get(&page.page_number);
        if let Some((line_index, line)) = margin_line(&lines, position, excluded_indices) {
            occurrences
                .entry(line.to_string())
                .or_default()
                .push((page.page_number, line_index));
        }
    }

    occurrences.retain(|_, matches| matches.len() > 1);
    occurrences
}

fn margin_line<'a>(
    lines: &'a [&'a str],
    position: MarginPosition,
    excluded: Option<&BTreeSet<usize>>,
) -> Option<(usize, &'a str)> {
    let is_candidate = |line_index: usize, line: &str| {
        !line.trim().is_empty()
            && !excluded.is_some_and(|indices| indices.contains(&line_index))
    };

    match position {
        MarginPosition::Top => lines.iter().enumerate().find_map(|(line_index, line)| {
            is_candidate(line_index, line).then(|| (line_index, line.trim()))
        }),
        MarginPosition::Bottom => lines
            .iter()
            .enumerate()
            .rev()
            .find_map(|(line_index, line)| {
                is_candidate(line_index, line).then(|| (line_index, line.trim()))
            }),
    }
}

fn repeated_margin_diagnostics(
    headers: &BTreeMap<String, Vec<(u32, usize)>>,
    footers: &BTreeMap<String, Vec<(u32, usize)>>,
) -> Vec<CleanupDiagnostic> {
    headers
        .iter()
        .chain(footers)
        .map(|(text, occurrences)| CleanupDiagnostic {
            kind: CleanupDiagnosticKind::RepeatedMarginArtifact,
            text: text.clone(),
            pages: occurrences
                .iter()
                .map(|(page_number, _)| *page_number)
                .collect(),
        })
        .collect()
}

fn margin_position_evidence(line_index: usize, line_count: usize) -> DocumentTextEvidence {
    if line_index == 0 {
        DocumentTextEvidence::TopMargin
    } else if line_index + 1 == line_count {
        DocumentTextEvidence::BottomMargin
    } else {
        unreachable!("page-number candidates are only collected from page margins")
    }
}

fn normalize_whitespace(text: &str) -> String {
    text.lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}
