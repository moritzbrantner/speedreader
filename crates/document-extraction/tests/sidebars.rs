use document_extraction::{
    extract_pages, CanonicalOcr, CanonicalOcrResult, DocumentTextEvidence, DocumentTextRole,
    ExtractionError, PageInput,
};
use image_analysis_ocr::{OcrDocument, OcrPreset};

struct SidebarOcr {
    document: OcrDocument,
}

impl CanonicalOcr for SidebarOcr {
    fn recognize_page(&self, _page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        Ok(CanonicalOcrResult::Structured(self.document.clone()))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn classifies_a_supported_narrow_edge_column_as_sidebar_without_hiding_it() {
    let document = extract(&[
        ("Body 1", 180, 120, 520, 40, "paragraph"),
        ("Sidebar A", 820, 140, 150, 35, "paragraph"),
        ("Body 2", 180, 200, 520, 40, "paragraph"),
        ("Body 3", 180, 280, 520, 40, "paragraph"),
        ("Sidebar B", 820, 300, 150, 35, "paragraph"),
        ("Body 4", 180, 360, 520, 40, "paragraph"),
        ("Body 5", 180, 440, 520, 40, "paragraph"),
        ("Body 6", 180, 520, 520, 40, "paragraph"),
    ]);

    assert_eq!(
        document.text,
        "Body 1\nSidebar A\nBody 2\nBody 3\nSidebar B\nBody 4\nBody 5\nBody 6"
    );
    let sidebars = document.pages[0]
        .regions
        .iter()
        .filter(|region| region.role == DocumentTextRole::Sidebar)
        .collect::<Vec<_>>();
    assert_eq!(sidebars.len(), 2);
    for sidebar in sidebars {
        assert!(sidebar.include_in_reading);
        assert_eq!(sidebar.confidence, None);
        assert_eq!(sidebar.column_index, Some(1));
        assert_eq!(
            sidebar.evidence,
            vec![
                DocumentTextEvidence::NarrowLayoutColumn,
                DocumentTextEvidence::PageEdge,
                DocumentTextEvidence::ParallelBodyColumn,
                DocumentTextEvidence::SecondaryColumnSupport,
            ]
        );
    }
}

#[test]
fn does_not_call_two_balanced_body_columns_sidebars() {
    let document = extract(&[
        ("Left 1", 80, 120, 380, 40, "paragraph"),
        ("Right 1", 540, 120, 380, 40, "paragraph"),
        ("Left 2", 80, 200, 380, 40, "paragraph"),
        ("Right 2", 540, 200, 380, 40, "paragraph"),
        ("Left 3", 80, 280, 380, 40, "paragraph"),
        ("Right 3", 540, 280, 380, 40, "paragraph"),
        ("Left 4", 80, 360, 380, 40, "paragraph"),
        ("Right 4", 540, 360, 380, 40, "paragraph"),
    ]);

    assert!(document.pages[0]
        .regions
        .iter()
        .all(|region| region.role == DocumentTextRole::Content));
}

#[test]
fn does_not_call_a_narrow_column_sidebar_when_support_is_balanced() {
    let document = extract(&[
        ("Body 1", 180, 120, 520, 40, "paragraph"),
        ("Side 1", 820, 120, 150, 35, "paragraph"),
        ("Body 2", 180, 200, 520, 40, "paragraph"),
        ("Side 2", 820, 200, 150, 35, "paragraph"),
        ("Body 3", 180, 280, 520, 40, "paragraph"),
        ("Side 3", 820, 280, 150, 35, "paragraph"),
        ("Body 4", 180, 360, 520, 40, "paragraph"),
    ]);

    assert!(document.pages[0]
        .regions
        .iter()
        .all(|region| region.role == DocumentTextRole::Content));
}

#[test]
fn does_not_call_a_narrow_interior_column_sidebar() {
    let document = extract(&[
        ("Body 1", 80, 120, 500, 40, "paragraph"),
        ("Note A", 650, 140, 150, 35, "paragraph"),
        ("Body 2", 80, 200, 500, 40, "paragraph"),
        ("Body 3", 80, 280, 500, 40, "paragraph"),
        ("Note B", 650, 300, 150, 35, "paragraph"),
        ("Body 4", 80, 360, 500, 40, "paragraph"),
        ("Body 5", 80, 440, 500, 40, "paragraph"),
        ("Body 6", 80, 520, 500, 40, "paragraph"),
    ]);

    assert!(document.pages[0]
        .regions
        .iter()
        .all(|region| region.role == DocumentTextRole::Content));
}

#[test]
fn keeps_explicit_ocr_roles_stronger_than_sidebar_geometry() {
    let document = extract(&[
        ("Body 1", 180, 120, 520, 40, "paragraph"),
        ("Figure note", 820, 140, 150, 35, "caption"),
        ("Body 2", 180, 200, 520, 40, "paragraph"),
        ("Body 3", 180, 280, 520, 40, "paragraph"),
        ("Body 4", 180, 360, 520, 40, "paragraph"),
    ]);

    let caption = document.pages[0]
        .regions
        .iter()
        .find(|region| region.text == "Figure note")
        .unwrap();
    assert_eq!(caption.role, DocumentTextRole::Caption);
    assert_eq!(caption.column_index, None);
}

fn extract(lines: &[(&str, u32, u32, u32, u32, &str)]) -> document_extraction::ReadingDocument {
    let text = lines
        .iter()
        .map(|(text, ..)| *text)
        .collect::<Vec<_>>()
        .join("\n");
    let blocks = lines
        .iter()
        .map(|(text, x, y, width, height, kind)| {
            serde_json::json!({
                "kind": kind,
                "text": text,
                "region": {"x": x, "y": y, "width": width, "height": height},
                "confidence": null,
                "lines": [],
                "attributes": {}
            })
        })
        .collect::<Vec<_>>();
    let ocr: OcrDocument = serde_json::from_value(serde_json::json!({
        "text": text,
        "width": 1000,
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
        &SidebarOcr { document: ocr },
    )
    .unwrap()
}
