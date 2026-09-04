use document_extraction::{
    extract_pages, CanonicalOcr, CanonicalOcrResult, DocumentTextEvidence, DocumentTextRole,
    ExtractionError, PageInput,
};
use image_analysis_ocr::{OcrDocument, OcrPreset};

struct FootnoteOcr;

impl CanonicalOcr for FootnoteOcr {
    fn recognize_page(&self, _page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        Ok(CanonicalOcrResult::Structured(ocr_document(&[
            ("Body text", "paragraph", 100, 300, 800, 120),
            ("1. Bottom footnote", "paragraph", 100, 1120, 800, 60),
            ("2. Mid-page item", "paragraph", 100, 500, 800, 60),
            ("Unmarked bottom note", "paragraph", 100, 1200, 800, 60),
        ])))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn requires_both_bottom_page_geometry_and_a_footnote_marker() {
    let document = extract_pages(
        [PageInput {
            page_number: 1,
            embedded_text: String::new(),
        }],
        &FootnoteOcr,
    )
    .unwrap();

    assert_eq!(
        document.text,
        "Body text\n1. Bottom footnote\n2. Mid-page item\nUnmarked bottom note"
    );
    assert_eq!(
        document.pages[0]
            .regions
            .iter()
            .map(|region| region.role)
            .collect::<Vec<_>>(),
        vec![
            DocumentTextRole::Content,
            DocumentTextRole::Footnote,
            DocumentTextRole::Content,
            DocumentTextRole::Content,
        ]
    );

    let footnote = &document.pages[0].regions[1];
    assert!(footnote.include_in_reading);
    assert_eq!(footnote.confidence, None);
    assert_eq!(
        footnote.evidence,
        vec![
            DocumentTextEvidence::BottomPageBand,
            DocumentTextEvidence::FootnoteMarker
        ]
    );
}

struct MarkerVariantsOcr;

impl CanonicalOcr for MarkerVariantsOcr {
    fn recognize_page(&self, _page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        Ok(CanonicalOcrResult::Structured(ocr_document(&[
            ("[12] Bracketed note", "paragraph", 100, 1120, 800, 50),
            ("* Symbol note", "paragraph", 100, 1180, 800, 50),
            ("1. Figure caption", "caption", 100, 1240, 800, 50),
        ])))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn accepts_common_markers_but_keeps_explicit_ocr_block_roles_stronger() {
    let document = extract_pages(
        [PageInput {
            page_number: 1,
            embedded_text: String::new(),
        }],
        &MarkerVariantsOcr,
    )
    .unwrap();

    assert_eq!(document.pages[0].regions[0].role, DocumentTextRole::Footnote);
    assert_eq!(document.pages[0].regions[1].role, DocumentTextRole::Footnote);
    assert_eq!(document.pages[0].regions[2].role, DocumentTextRole::Caption);
    assert_eq!(
        document.pages[0].regions[2].evidence,
        vec![DocumentTextEvidence::OcrBlockHint]
    );
}

fn ocr_document(blocks: &[(&str, &str, u32, u32, u32, u32)]) -> OcrDocument {
    let text = blocks
        .iter()
        .map(|(text, _, _, _, _, _)| *text)
        .collect::<Vec<_>>()
        .join("\n");
    serde_json::from_value(serde_json::json!({
        "text": text,
        "width": 1000,
        "height": 1400,
        "language": null,
        "confidence": null,
        "blocks": blocks
            .iter()
            .map(|(text, kind, x, y, width, height)| serde_json::json!({
                "kind": kind,
                "text": text,
                "region": {"x": x, "y": y, "width": width, "height": height},
                "confidence": null,
                "lines": [],
                "attributes": {}
            }))
            .collect::<Vec<_>>(),
        "attributes": {}
    }))
    .unwrap()
}
