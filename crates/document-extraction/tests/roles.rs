use document_extraction::{
    extract_pages, CanonicalOcr, CanonicalOcrResult, DocumentTextEvidence, DocumentTextRole,
    ExtractionError, PageInput,
};
use image_analysis_ocr::{OcrDocument, OcrPreset};

struct BlockRoleOcr;

impl CanonicalOcr for BlockRoleOcr {
    fn recognize_page(&self, _page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        Ok(CanonicalOcrResult::Structured(ocr_document(
            "Title\nFigure 1\nA | B\nName: Value\nBody text",
            &[
                ("heading", "Title"),
                ("caption", "Figure 1"),
                ("table", "A | B"),
                ("form", "Name: Value"),
                ("paragraph", "Body text"),
            ],
        )))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn classifies_canonical_ocr_block_hints_without_changing_the_reading_projection() {
    let document = extract_pages(
        [PageInput {
            page_number: 1,
            embedded_text: String::new(),
        }],
        &BlockRoleOcr,
    )
    .unwrap();

    assert_eq!(
        document.text,
        "Title\nFigure 1\nA | B\nName: Value\nBody text"
    );
    assert_eq!(
        document.pages[0]
            .regions
            .iter()
            .map(|region| region.role)
            .collect::<Vec<_>>(),
        vec![
            DocumentTextRole::Heading,
            DocumentTextRole::Caption,
            DocumentTextRole::Table,
            DocumentTextRole::Form,
            DocumentTextRole::Content,
        ]
    );

    for region in &document.pages[0].regions[..4] {
        assert!(region.include_in_reading);
        assert_eq!(region.confidence, None);
        assert_eq!(
            region.evidence,
            vec![DocumentTextEvidence::OcrBlockHint]
        );
    }
    assert!(document.pages[0].regions[4].evidence.is_empty());
}

struct MarginPrecedenceOcr;

impl CanonicalOcr for MarginPrecedenceOcr {
    fn recognize_page(&self, page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        let body = format!("Body {page_number}");
        let page = page_number.to_string();
        Ok(CanonicalOcrResult::Structured(ocr_document(
            &format!("Magazine\n{body}\n{page}"),
            &[("heading", "Magazine"), ("paragraph", &body), ("paragraph", &page)],
        )))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn deterministic_margin_roles_take_precedence_over_ocr_block_hints() {
    let document = extract_pages(
        [
            PageInput {
                page_number: 1,
                embedded_text: String::new(),
            },
            PageInput {
                page_number: 2,
                embedded_text: String::new(),
            },
        ],
        &MarginPrecedenceOcr,
    )
    .unwrap();

    assert_eq!(document.text, "Body 1\n\nBody 2");
    for page in &document.pages {
        let header = &page.regions[0];
        assert_eq!(header.role, DocumentTextRole::Header);
        assert_eq!(
            header.evidence,
            vec![
                DocumentTextEvidence::TopMargin,
                DocumentTextEvidence::RepeatedAcrossPages
            ]
        );
        assert_eq!(
            header
                .ocr
                .as_ref()
                .and_then(|ocr| ocr.block_kind.as_deref()),
            Some("heading")
        );

        let page_number = page.regions.last().unwrap();
        assert_eq!(page_number.role, DocumentTextRole::PageNumber);
        assert!(!page_number.include_in_reading);
    }
}

fn ocr_document(text: &str, blocks: &[(&str, &str)]) -> OcrDocument {
    serde_json::from_value(serde_json::json!({
        "text": text,
        "width": 1000,
        "height": 1400,
        "language": null,
        "confidence": null,
        "blocks": blocks
            .iter()
            .map(|(kind, text)| serde_json::json!({
                "kind": kind,
                "text": text,
                "region": null,
                "confidence": null,
                "lines": [],
                "attributes": {}
            }))
            .collect::<Vec<_>>(),
        "attributes": {}
    }))
    .unwrap()
}
