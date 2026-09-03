use document_extraction::{
    extract_pages, extract_text, CanonicalOcr, CanonicalOcrResult, DocumentReadingOrderStrategy,
    ExtractionError, PageInput,
};
use image_analysis_ocr::{OcrDocument, OcrPreset};

struct ReadingOrderOcr {
    document: OcrDocument,
}

impl CanonicalOcr for ReadingOrderOcr {
    fn recognize_page(&self, _page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        Ok(CanonicalOcrResult::Structured(self.document.clone()))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn plain_text_keeps_source_reading_order() {
    let document = extract_text("First\nSecond");
    let order = &document.pages[0].reading_order;

    assert_eq!(order.strategy, DocumentReadingOrderStrategy::SourceOrder);
    assert_eq!(order.region_indices, vec![0, 1]);
}

#[test]
fn derives_column_major_order_without_changing_the_current_text_projection() {
    let document = extract(&[
        ("Left 1", 80, 120, 380, 40, "paragraph"),
        ("Right 1", 540, 120, 380, 40, "paragraph"),
        ("Left 2", 80, 200, 380, 40, "paragraph"),
        ("Right 2", 540, 200, 380, 40, "paragraph"),
    ]);

    assert_eq!(document.text, "Left 1\nRight 1\nLeft 2\nRight 2");
    assert_eq!(
        document.pages[0].reading_order.strategy,
        DocumentReadingOrderStrategy::ColumnMajor
    );
    assert_eq!(document.pages[0].reading_order.region_indices, vec![0, 2, 1, 3]);
}

#[test]
fn places_a_spanning_heading_before_parallel_body_columns() {
    let document = extract(&[
        ("Title", 80, 40, 840, 50, "heading"),
        ("Left 1", 80, 140, 380, 40, "paragraph"),
        ("Right 1", 540, 140, 380, 40, "paragraph"),
        ("Left 2", 80, 220, 380, 40, "paragraph"),
        ("Right 2", 540, 220, 380, 40, "paragraph"),
    ]);

    assert_eq!(
        document.pages[0].reading_order.strategy,
        DocumentReadingOrderStrategy::ColumnMajor
    );
    assert_eq!(
        document.pages[0].reading_order.region_indices,
        vec![0, 1, 3, 2, 4]
    );
}

#[test]
fn ambiguous_non_column_content_forces_source_order_fallback() {
    let document = extract(&[
        ("Left 1", 80, 120, 380, 40, "paragraph"),
        ("Right 1", 540, 120, 380, 40, "paragraph"),
        ("Figure caption", 300, 180, 400, 35, "caption"),
        ("Left 2", 80, 240, 380, 40, "paragraph"),
        ("Right 2", 540, 240, 380, 40, "paragraph"),
    ]);

    assert_eq!(
        document.pages[0].reading_order.strategy,
        DocumentReadingOrderStrategy::SourceOrder
    );
    assert_eq!(
        document.pages[0].reading_order.region_indices,
        vec![0, 1, 2, 3, 4]
    );
}

#[test]
fn puts_a_detected_sidebar_after_two_body_columns_in_candidate_order() {
    let document = extract_with_width(
        1200,
        &[
            ("Left 1", 80, 120, 400, 40, "paragraph"),
            ("Right 1", 520, 120, 400, 40, "paragraph"),
            ("Sidebar A", 1000, 140, 180, 35, "paragraph"),
            ("Left 2", 80, 200, 400, 40, "paragraph"),
            ("Right 2", 520, 200, 400, 40, "paragraph"),
            ("Left 3", 80, 280, 400, 40, "paragraph"),
            ("Right 3", 520, 280, 400, 40, "paragraph"),
            ("Sidebar B", 1000, 300, 180, 35, "paragraph"),
            ("Left 4", 80, 360, 400, 40, "paragraph"),
            ("Right 4", 520, 360, 400, 40, "paragraph"),
        ],
    );

    assert_eq!(
        document.pages[0].reading_order.strategy,
        DocumentReadingOrderStrategy::ColumnMajor
    );
    assert_eq!(
        document.pages[0].reading_order.region_indices,
        vec![0, 3, 5, 8, 1, 4, 6, 9, 2, 7]
    );
}

fn extract(lines: &[(&str, u32, u32, u32, u32, &str)]) -> document_extraction::ReadingDocument {
    extract_with_width(1000, lines)
}

fn extract_with_width(
    width: u32,
    lines: &[(&str, u32, u32, u32, u32, &str)],
) -> document_extraction::ReadingDocument {
    let text = lines
        .iter()
        .map(|(text, ..)| *text)
        .collect::<Vec<_>>()
        .join("\n");
    let blocks = lines
        .iter()
        .map(|(text, x, y, block_width, height, kind)| {
            serde_json::json!({
                "kind": kind,
                "text": text,
                "region": {"x": x, "y": y, "width": block_width, "height": height},
                "confidence": null,
                "lines": [],
                "attributes": {}
            })
        })
        .collect::<Vec<_>>();
    let ocr: OcrDocument = serde_json::from_value(serde_json::json!({
        "text": text,
        "width": width,
        "height": 1400,
        "language": null,
        "confidence": null,
        "blocks": blocks,
        "attributes": {}
    }))
    .unwrap();

    extract_pages(
        [PageInput {
            page_number: 1,
            embedded_text: String::new(),
        }],
        &ReadingOrderOcr { document: ocr },
    )
    .unwrap()
}
