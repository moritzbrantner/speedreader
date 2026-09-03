use document_extraction::{
    extract_pages, CanonicalOcr, CanonicalOcrResult, DocumentTextRole, ExtractionError, PageInput,
};
use image_analysis_ocr::{OcrDocument, OcrPreset};

#[derive(Clone)]
struct StructuredLayoutOcr {
    document: OcrDocument,
}

impl CanonicalOcr for StructuredLayoutOcr {
    fn recognize_page(&self, _page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        Ok(CanonicalOcrResult::Structured(self.document.clone()))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

struct TextOnlyOcr;

impl CanonicalOcr for TextOnlyOcr {
    fn recognize_page(&self, _page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        Ok(CanonicalOcrResult::Text("First\nSecond".into()))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn leaves_layout_unknown_without_geometry() {
    let document = extract_pages(
        [PageInput {
            page_number: 1,
            embedded_text: String::new(),
        }],
        &TextOnlyOcr,
    )
    .unwrap();

    assert_eq!(document.pages[0].layout, None);
    assert!(document.pages[0]
        .regions
        .iter()
        .all(|region| region.column_index.is_none()));
}

#[test]
fn detects_a_supported_single_column() {
    let ocr = StructuredLayoutOcr {
        document: ocr_document(
            "First\nSecond\nThird",
            &[
                ("paragraph", "First", [120, 120, 700, 32]),
                ("paragraph", "Second", [130, 180, 690, 32]),
                ("paragraph", "Third", [110, 240, 710, 32]),
            ],
        ),
    };

    let document = scanned_page(&ocr);
    let layout = document.pages[0].layout.as_ref().unwrap();

    assert_eq!(layout.columns.len(), 1);
    assert_eq!(layout.columns[0].index, 0);
    assert_eq!(layout.columns[0].region_indices, vec![0, 1, 2]);
    assert!(document.pages[0]
        .regions
        .iter()
        .all(|region| region.column_index == Some(0)));
}

#[test]
fn detects_two_overlapping_columns_without_changing_reading_order() {
    let ocr = StructuredLayoutOcr {
        document: ocr_document(
            "Two columns\nLeft one\nRight one\nLeft two\nRight two",
            &[
                ("heading", "Two columns", [80, 50, 840, 40]),
                ("paragraph", "Left one", [100, 150, 300, 32]),
                ("paragraph", "Right one", [600, 150, 300, 32]),
                ("paragraph", "Left two", [110, 220, 290, 32]),
                ("paragraph", "Right two", [610, 220, 290, 32]),
            ],
        ),
    };

    let document = scanned_page(&ocr);
    let page = &document.pages[0];
    let layout = page.layout.as_ref().unwrap();

    assert_eq!(
        document.text,
        "Two columns\nLeft one\nRight one\nLeft two\nRight two"
    );
    assert_eq!(layout.columns.len(), 2);
    assert_eq!(layout.columns[0].region_indices, vec![1, 3]);
    assert_eq!(layout.columns[1].region_indices, vec![2, 4]);
    assert_eq!(page.regions[0].role, DocumentTextRole::Heading);
    assert_eq!(page.regions[0].column_index, None);
    assert_eq!(page.regions[1].column_index, Some(0));
    assert_eq!(page.regions[2].column_index, Some(1));
    assert_eq!(page.regions[3].column_index, Some(0));
    assert_eq!(page.regions[4].column_index, Some(1));
    assert!(layout.columns[0].bounds.x < layout.columns[1].bounds.x);
}

#[test]
fn does_not_treat_sequentially_offset_sections_as_parallel_columns() {
    let ocr = StructuredLayoutOcr {
        document: ocr_document(
            "Upper one\nUpper two\nLower one\nLower two",
            &[
                ("paragraph", "Upper one", [100, 100, 300, 32]),
                ("paragraph", "Upper two", [110, 160, 290, 32]),
                ("paragraph", "Lower one", [600, 800, 300, 32]),
                ("paragraph", "Lower two", [610, 860, 290, 32]),
            ],
        ),
    };

    let document = scanned_page(&ocr);
    let page = &document.pages[0];
    let layout = page.layout.as_ref().unwrap();

    assert_eq!(layout.columns.len(), 1);
    assert_eq!(layout.columns[0].region_indices, vec![0, 1]);
    assert_eq!(page.regions[0].column_index, Some(0));
    assert_eq!(page.regions[1].column_index, Some(0));
    assert_eq!(page.regions[2].column_index, None);
    assert_eq!(page.regions[3].column_index, None);
}

#[test]
fn ignores_a_single_marginal_outlier_when_building_columns() {
    let ocr = StructuredLayoutOcr {
        document: ocr_document(
            "Body one\nBody two\nBody three\nMarginal note",
            &[
                ("paragraph", "Body one", [100, 120, 650, 32]),
                ("paragraph", "Body two", [110, 180, 640, 32]),
                ("paragraph", "Body three", [100, 240, 650, 32]),
                ("paragraph", "Marginal note", [820, 180, 140, 32]),
            ],
        ),
    };

    let document = scanned_page(&ocr);
    let page = &document.pages[0];
    let layout = page.layout.as_ref().unwrap();

    assert_eq!(layout.columns.len(), 1);
    assert_eq!(layout.columns[0].region_indices, vec![0, 1, 2]);
    assert_eq!(page.regions[3].column_index, None);
}

fn scanned_page(ocr: &StructuredLayoutOcr) -> document_extraction::ReadingDocument {
    extract_pages(
        [PageInput {
            page_number: 1,
            embedded_text: String::new(),
        }],
        ocr,
    )
    .unwrap()
}

fn ocr_document(text: &str, blocks: &[(&str, &str, [u32; 4])]) -> OcrDocument {
    serde_json::from_value(serde_json::json!({
        "text": text,
        "width": 1000,
        "height": 1200,
        "language": null,
        "confidence": null,
        "blocks": blocks
            .iter()
            .map(|(kind, text, [x, y, width, height])| serde_json::json!({
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
