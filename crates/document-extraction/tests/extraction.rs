use document_extraction::{
    extract_pages, CanonicalOcr, ExtractionError, ExtractionProvenance, PageInput,
};
use image_analysis_ocr::OcrPreset;

struct FixtureOcr;

impl CanonicalOcr for FixtureOcr {
    fn recognize_page(&self, page_number: u32) -> Result<String, ExtractionError> {
        Ok(format!("scanned page {page_number}"))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn uses_embedded_text_without_ocr() {
    let document = extract_pages(
        [PageInput { page_number: 1, embedded_text: "Hello   text PDF".into() }],
        &FixtureOcr,
    )
    .unwrap();
    assert_eq!(document.text, "Hello text PDF");
    assert_eq!(document.pages[0].provenance, ExtractionProvenance::EmbeddedText);
}

#[test]
fn uses_canonical_ocr_for_scanned_pages_and_keeps_page_provenance() {
    let document = extract_pages(
        [
            PageInput { page_number: 1, embedded_text: "native page".into() },
            PageInput { page_number: 2, embedded_text: String::new() },
        ],
        &FixtureOcr,
    )
    .unwrap();
    assert_eq!(document.pages[1].text, "scanned page 2");
    assert_eq!(
        document.pages[1].provenance,
        ExtractionProvenance::CanonicalOcr { preset: "trocr-base-printed-onnx".into() }
    );
}

#[test]
fn removes_recurring_margins_and_page_numbers_deterministically() {
    let document = extract_pages(
        [
            PageInput { page_number: 1, embedded_text: "Magazine\nFirst body\n1".into() },
            PageInput { page_number: 2, embedded_text: "Magazine\nSecond body\n2".into() },
        ],
        &FixtureOcr,
    )
    .unwrap();
    assert_eq!(document.text, "First body\n\nSecond body");
    assert_eq!(document.diagnostics.len(), 3);
}
