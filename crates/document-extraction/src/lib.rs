use std::collections::{BTreeMap, BTreeSet};

use image_analysis_ocr::{OcrBlockKind, OcrDocument, OcrPreset};
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
    /// Pixel dimensions of the rendered source image when structured OCR provides them.
    pub source_image_size: Option<DocumentPixelSize>,
    /// Source lines retained with their structural classification, including lines
    /// excluded from the speed-reading projection.
    pub regions: Vec<DocumentTextRegion>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPixelSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentPixelRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRegionEvidence {
    /// Canonical OCR block hint. This is source evidence, not a semantic decision.
    pub block_kind: Option<String>,
    pub confidence: Option<u8>,
    pub region: Option<DocumentPixelRegion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTextRegion {
    /// Zero-based line index in the normalized source page before filtering.
    pub source_line_index: u32,
    pub text: String,
    pub role: DocumentTextRole,
    /// Confidence in the product structural/semantic role. OCR confidence remains
    /// separately available under `ocr`.
    pub confidence: Option<u8>,
    pub evidence: Vec<DocumentTextEvidence>,
    /// OCR-owned evidence retained independently from product structural roles.
    pub ocr: Option<OcrRegionEvidence>,
    pub include_in_reading: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentTextRole {
    /// Reading content that has not yet been assigned a more specific semantic role.
    Content,
    Heading,
    Caption,
    Table,
    Form,
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
    OcrBlockHint,
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CanonicalOcrResult {
    /// Text-only OCR output from adapters that do not provide structured evidence.
    Text(String),
    /// Canonical rich OCR output with optional layout, confidence, and block hints.
    Structured(OcrDocument),
}

pub trait CanonicalOcr {
    fn recognize_page(&self, page_number: u32) -> Result<CanonicalOcrResult, ExtractionError>;
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
    let text = normalize_whitespace(text);
    let regions = regions_from_text(&text);
    cleanup(vec![ExtractedPage {
        page_number: 1,
        text,
        provenance: ExtractionProvenance::EmbeddedText,
        source_image_size: None,
        regions,
    }])
}

pub fn extract_pages(
    pages: impl IntoIterator<Item = PageInput>,
    ocr: &impl CanonicalOcr,
) -> Result<ReadingDocument, ExtractionError> {
    let mut extracted = Vec::new();
    for page in pages {
        let normalized = normalize_whitespace(&page.embedded_text);
        let (text, provenance, source_image_size, regions) = if normalized.is_empty() {
            let provenance = ExtractionProvenance::CanonicalOcr {
                preset: ocr.preset().as_str().to_string(),
            };
            match ocr.recognize_page(page.page_number)? {
                CanonicalOcrResult::Text(text) => {
                    let text = normalize_whitespace(&text);
                    let regions = regions_from_ocr_text(&text);
                    (text, provenance, None, regions)
                }
                CanonicalOcrResult::Structured(document) => {
                    let text = normalize_whitespace(&document.text);
                    let source_image_size = Some(DocumentPixelSize {
                        width: document.width,
                        height: document.height,
                    });
                    let regions = regions_from_ocr(&document, &text);
                    (text, provenance, source_image_size, regions)
                }
            }
        } else {
            let regions = regions_from_text(&normalized);
            (
                normalized,
                ExtractionProvenance::EmbeddedText,
                None,
                regions,
            )
        };
        extracted.push(ExtractedPage {
            page_number: page.page_number,
            text,
            provenance,
            source_image_size,
            regions,
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
        let mut regions = std::mem::take(&mut page.regions);
        if !regions_match_lines(&regions, &lines) {
            regions = regions_from_text(&page.text);
        }

        for (line_index, (line, region)) in lines.iter().zip(regions.iter_mut()).enumerate() {
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
                let (role, confidence, evidence) = classify_content_region(region);
                (role, confidence, evidence, true)
            };

            region.source_line_index = line_index as u32;
            region.text = line.clone();
            region.role = role;
            region.confidence = confidence;
            region.evidence = evidence;
            region.include_in_reading = include_in_reading;
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

fn classify_content_region(
    region: &DocumentTextRegion,
) -> (DocumentTextRole, Option<u8>, Vec<DocumentTextEvidence>) {
    let Some(block_kind) = region
        .ocr
        .as_ref()
        .and_then(|ocr| ocr.block_kind.as_deref())
    else {
        return (DocumentTextRole::Content, None, Vec::new());
    };

    let role = match block_kind {
        "heading" => DocumentTextRole::Heading,
        "caption" => DocumentTextRole::Caption,
        "table" => DocumentTextRole::Table,
        "form" => DocumentTextRole::Form,
        _ => return (DocumentTextRole::Content, None, Vec::new()),
    };

    (
        role,
        Some(80),
        vec![DocumentTextEvidence::OcrBlockHint],
    )
}

#[derive(Debug, Clone)]
struct OcrLineMetadata {
    text: String,
    evidence: OcrRegionEvidence,
}

fn regions_from_text(text: &str) -> Vec<DocumentTextRegion> {
    text.lines()
        .enumerate()
        .map(|(line_index, line)| DocumentTextRegion {
            source_line_index: line_index as u32,
            text: line.to_string(),
            role: DocumentTextRole::Content,
            confidence: None,
            evidence: Vec::new(),
            ocr: None,
            include_in_reading: true,
        })
        .collect()
}

fn regions_from_ocr_text(text: &str) -> Vec<DocumentTextRegion> {
    regions_from_text(text)
        .into_iter()
        .map(|mut region| {
            region.ocr = Some(OcrRegionEvidence {
                block_kind: None,
                confidence: None,
                region: None,
            });
            region
        })
        .collect()
}

fn regions_from_ocr(document: &OcrDocument, normalized_text: &str) -> Vec<DocumentTextRegion> {
    let document_confidence = document.confidence.map(|confidence| confidence.value());
    let metadata = ocr_line_metadata(document, document_confidence);
    let mut metadata_cursor = 0;

    normalized_text
        .lines()
        .enumerate()
        .map(|(line_index, line)| {
            let matched = metadata[metadata_cursor..]
                .iter()
                .position(|candidate| candidate.text == line)
                .map(|offset| metadata_cursor + offset);
            let ocr = matched
                .map(|index| {
                    metadata_cursor = index + 1;
                    metadata[index].evidence.clone()
                })
                .unwrap_or(OcrRegionEvidence {
                    block_kind: None,
                    confidence: document_confidence,
                    region: None,
                });

            DocumentTextRegion {
                source_line_index: line_index as u32,
                text: line.to_string(),
                role: DocumentTextRole::Content,
                confidence: None,
                evidence: Vec::new(),
                ocr: Some(ocr),
                include_in_reading: true,
            }
        })
        .collect()
}

fn ocr_line_metadata(
    document: &OcrDocument,
    document_confidence: Option<u8>,
) -> Vec<OcrLineMetadata> {
    let mut metadata = Vec::new();

    for block in &document.blocks {
        let block_kind = Some(ocr_block_kind_name(&block.kind));
        let block_confidence = block
            .confidence
            .map(|confidence| confidence.value())
            .or(document_confidence);
        let block_region = block.region.as_ref().map(|region| DocumentPixelRegion {
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height,
        });

        if block.lines.is_empty() {
            push_ocr_metadata_lines(
                &mut metadata,
                &block.text,
                OcrRegionEvidence {
                    block_kind,
                    confidence: block_confidence,
                    region: block_region,
                },
            );
            continue;
        }

        for line in &block.lines {
            let line_region = line
                .region
                .as_ref()
                .map(|region| DocumentPixelRegion {
                    x: region.x,
                    y: region.y,
                    width: region.width,
                    height: region.height,
                })
                .or(block_region);
            let line_confidence = line
                .confidence
                .map(|confidence| confidence.value())
                .or(block_confidence);
            push_ocr_metadata_lines(
                &mut metadata,
                &line.text,
                OcrRegionEvidence {
                    block_kind: block_kind.clone(),
                    confidence: line_confidence,
                    region: line_region,
                },
            );
        }
    }

    metadata
}

fn push_ocr_metadata_lines(
    metadata: &mut Vec<OcrLineMetadata>,
    text: &str,
    evidence: OcrRegionEvidence,
) {
    for line in normalize_whitespace(text).lines() {
        metadata.push(OcrLineMetadata {
            text: line.to_string(),
            evidence: evidence.clone(),
        });
    }
}

fn ocr_block_kind_name(kind: &OcrBlockKind) -> String {
    match kind {
        OcrBlockKind::Paragraph => "paragraph".to_string(),
        OcrBlockKind::Heading => "heading".to_string(),
        OcrBlockKind::Table => "table".to_string(),
        OcrBlockKind::Form => "form".to_string(),
        OcrBlockKind::Caption => "caption".to_string(),
        OcrBlockKind::Custom(value) => value.clone(),
    }
}

fn regions_match_lines(regions: &[DocumentTextRegion], lines: &[String]) -> bool {
    regions.len() == lines.len()
        && regions
            .iter()
            .zip(lines)
            .all(|(region, line)| region.text == *line)
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
