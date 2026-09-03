use document_extraction::{
    extract_pages, extract_pdf, extract_text, CanonicalOcr, DocumentPixelRegion, DocumentPixelSize,
    DocumentTextEvidence, DocumentTextRole, ExtractionError, ExtractionProvenance, PageInput,
};
use image_analysis_ocr::{OcrDocument, OcrPreset};
use lopdf::{dictionary, Document, Object, Stream};

struct FixtureOcr;

#[test]
fn creates_the_shared_document_contract_for_plain_text() {
    let document = extract_text("Hello   local\n\nreader");

    assert_eq!(document.version, 1);
    assert_eq!(document.text, "Hello local\nreader");
    assert_eq!(document.pages.len(), 1);
    assert_eq!(document.pages[0].regions.len(), 2);
    assert_eq!(document.pages[0].regions[0].role, DocumentTextRole::Content);
    assert_eq!(document.pages[0].source_image_size, None);
    assert_eq!(document.pages[0].regions[0].ocr, None);
    assert_eq!(
        document.pages[0].provenance,
        ExtractionProvenance::EmbeddedText
    );
}

impl CanonicalOcr for FixtureOcr {
    fn recognize_page(&self, page_number: u32) -> Result<OcrDocument, ExtractionError> {
        Ok(OcrDocument::new(format!("scanned page {page_number}"), 640, 480).unwrap())
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[test]
fn uses_embedded_text_without_ocr() {
    let document = extract_pages(
        [PageInput {
            page_number: 1,
            embedded_text: "Hello   text PDF".into(),
        }],
        &FixtureOcr,
    )
    .unwrap();
    assert_eq!(document.text, "Hello text PDF");
    assert_eq!(
        document.pages[0].provenance,
        ExtractionProvenance::EmbeddedText
    );
}

#[test]
fn extracts_a_text_layer_pdf_without_invoking_ocr() {
    let document = extract_pdf(&pdf_with_pages(&[Some("Hello text PDF")]), &FixtureOcr).unwrap();

    assert_eq!(document.text, "Hello text PDF");
    assert_eq!(
        document.pages[0].provenance,
        ExtractionProvenance::EmbeddedText
    );
}

#[test]
fn extracts_a_scanned_pdf_through_the_canonical_ocr_adapter() {
    let document = extract_pdf(&pdf_with_pages(&[None]), &FixtureOcr).unwrap();

    assert_eq!(document.text, "scanned page 1");
    assert_eq!(
        document.pages[0].source_image_size,
        Some(DocumentPixelSize {
            width: 640,
            height: 480
        })
    );
    assert_eq!(
        document.pages[0].provenance,
        ExtractionProvenance::CanonicalOcr {
            preset: "trocr-base-printed-onnx".into()
        }
    );
}

#[test]
fn uses_canonical_ocr_for_scanned_pages_and_keeps_page_provenance() {
    let document = extract_pages(
        [
            PageInput {
                page_number: 1,
                embedded_text: "native page".into(),
            },
            PageInput {
                page_number: 2,
                embedded_text: String::new(),
            },
        ],
        &FixtureOcr,
    )
    .unwrap();
    assert_eq!(document.pages[1].text, "scanned page 2");
    assert_eq!(
        document.pages[1].provenance,
        ExtractionProvenance::CanonicalOcr {
            preset: "trocr-base-printed-onnx".into()
        }
    );
}

#[test]
fn retains_structured_ocr_geometry_confidence_and_block_kind_as_source_evidence() {
    struct StructuredOcr;

    impl CanonicalOcr for StructuredOcr {
        fn recognize_page(&self, _page_number: u32) -> Result<OcrDocument, ExtractionError> {
            Ok(serde_json::from_value(serde_json::json!({
                "text": "Chapter One\nBody text",
                "width": 1000,
                "height": 1400,
                "language": "en",
                "confidence": 80,
                "blocks": [
                    {
                        "kind": "heading",
                        "text": "Chapter One",
                        "region": {"x": 20, "y": 30, "width": 400, "height": 60},
                        "confidence": 91,
                        "lines": [
                            {
                                "text": "Chapter One",
                                "region": {"x": 22, "y": 32, "width": 390, "height": 50},
                                "confidence": 95,
                                "tokens": [],
                                "attributes": {}
                            }
                        ],
                        "attributes": {}
                    },
                    {
                        "kind": "paragraph",
                        "text": "Body text",
                        "region": {"x": 40, "y": 120, "width": 800, "height": 160},
                        "confidence": 88,
                        "lines": [],
                        "attributes": {}
                    }
                ],
                "attributes": {}
            }))
            .unwrap())
        }

        fn preset(&self) -> OcrPreset {
            OcrPreset::TrOcrBasePrintedOnnx
        }
    }

    let document = extract_pages(
        [PageInput {
            page_number: 1,
            embedded_text: String::new(),
        }],
        &StructuredOcr,
    )
    .unwrap();

    assert_eq!(document.text, "Chapter One\nBody text");
    assert_eq!(
        document.pages[0].source_image_size,
        Some(DocumentPixelSize {
            width: 1000,
            height: 1400
        })
    );

    let heading = document.pages[0].regions[0].ocr.as_ref().unwrap();
    assert_eq!(heading.block_kind.as_deref(), Some("heading"));
    assert_eq!(heading.confidence, Some(95));
    assert_eq!(
        heading.region,
        Some(DocumentPixelRegion {
            x: 22,
            y: 32,
            width: 390,
            height: 50
        })
    );
    assert_eq!(document.pages[0].regions[0].confidence, None);

    let body = document.pages[0].regions[1].ocr.as_ref().unwrap();
    assert_eq!(body.block_kind.as_deref(), Some("paragraph"));
    assert_eq!(body.confidence, Some(88));
    assert_eq!(
        body.region,
        Some(DocumentPixelRegion {
            x: 40,
            y: 120,
            width: 800,
            height: 160
        })
    );
}

#[test]
fn classifies_recurring_headers_and_page_numbers_without_discarding_source_lines() {
    let document = extract_pages(
        [
            PageInput {
                page_number: 1,
                embedded_text: "Magazine\nFirst body\n1".into(),
            },
            PageInput {
                page_number: 2,
                embedded_text: "Magazine\nSecond body\n2".into(),
            },
        ],
        &FixtureOcr,
    )
    .unwrap();

    assert_eq!(document.text, "First body\n\nSecond body");
    assert_eq!(document.diagnostics.len(), 3);

    let header = &document.pages[0].regions[0];
    assert_eq!(header.text, "Magazine");
    assert_eq!(header.role, DocumentTextRole::Header);
    assert!(!header.include_in_reading);
    assert_eq!(
        header.evidence,
        vec![
            DocumentTextEvidence::TopMargin,
            DocumentTextEvidence::RepeatedAcrossPages
        ]
    );

    let page_number = &document.pages[0].regions[2];
    assert_eq!(page_number.text, "1");
    assert_eq!(page_number.role, DocumentTextRole::PageNumber);
    assert!(!page_number.include_in_reading);
    assert!(page_number
        .evidence
        .contains(&DocumentTextEvidence::SequentialPageNumber));
}

#[test]
fn classifies_footer_behind_a_page_number() {
    let document = extract_pages(
        [
            PageInput {
                page_number: 1,
                embedded_text: "Magazine\nFirst body\nCopyright Example\n10".into(),
            },
            PageInput {
                page_number: 2,
                embedded_text: "Magazine\nSecond body\nCopyright Example\n11".into(),
            },
        ],
        &FixtureOcr,
    )
    .unwrap();

    assert_eq!(document.text, "First body\n\nSecond body");
    let footer = document.pages[0]
        .regions
        .iter()
        .find(|region| region.text == "Copyright Example")
        .unwrap();
    assert_eq!(footer.role, DocumentTextRole::Footer);
    assert_eq!(
        footer.evidence,
        vec![
            DocumentTextEvidence::BottomMargin,
            DocumentTextEvidence::RepeatedAcrossPages
        ]
    );
}

#[test]
fn keeps_numeric_content_that_is_not_a_page_number() {
    let document = extract_pages(
        [
            PageInput {
                page_number: 1,
                embedded_text: "Magazine\nRevenue\n2026\n10".into(),
            },
            PageInput {
                page_number: 2,
                embedded_text: "Magazine\nRevenue forecast\n2027\n11".into(),
            },
        ],
        &FixtureOcr,
    )
    .unwrap();

    assert_eq!(document.text, "Revenue\n2026\n\nRevenue forecast\n2027");
    let numeric_content = document.pages[0]
        .regions
        .iter()
        .find(|region| region.text == "2026")
        .unwrap();
    assert_eq!(numeric_content.role, DocumentTextRole::Content);
    assert!(numeric_content.include_in_reading);
}

fn pdf_with_pages(texts: &[Option<&str>]) -> Vec<u8> {
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let font_id = document.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    });
    let page_ids = texts
        .iter()
        .map(|text| {
            let content_id = text.map(|text| {
                document.add_object(Stream::new(
                    dictionary! {},
                    format!("BT /F1 12 Tf 72 720 Td ({text}) Tj ET").into_bytes(),
                ))
            });
            let mut page = dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
                "Resources" => dictionary! { "Font" => dictionary! { "F1" => font_id } },
            };
            if let Some(content_id) = content_id {
                page.set("Contents", content_id);
            }
            document.add_object(page)
        })
        .collect::<Vec<_>>();
    document.objects.insert(
        pages_id,
        dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.into_iter().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => texts.len() as i64,
        }
        .into(),
    );
    let catalog_id = document.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    document.trailer.set("Root", catalog_id);

    let mut pdf = Vec::new();
    document.save_to(&mut pdf).unwrap();
    pdf
}
