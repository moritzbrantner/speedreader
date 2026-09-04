#![cfg(target_arch = "wasm32")]

use std::collections::BTreeMap;

use document_extraction::{
    extract_pages, inspect_pdf, CanonicalOcr, CanonicalOcrResult, ExtractionError,
    ExtractionProvenance, PageInput, ReadingDocument,
};
use ocrs::{ImageSource, OcrEngine, OcrEngineParams};
use rten::Model;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const BROWSER_OCR_PRESET: &str = "ocrs-0.13.0";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InspectedPage {
    page_number: u32,
    embedded_text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserPageInput {
    page_number: u32,
    embedded_text: String,
    #[serde(default)]
    ocr_text: Option<String>,
}

struct PrecomputedOcr {
    pages: BTreeMap<u32, String>,
}

impl CanonicalOcr for PrecomputedOcr {
    fn recognize_page(&self, page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
        self.pages
            .get(&page_number)
            .cloned()
            .map(CanonicalOcrResult::Text)
            .ok_or_else(|| ExtractionError::Ocr {
                page_number,
                message: "browser OCR result was not supplied for this scanned page".to_string(),
            })
    }

    fn preset(&self) -> document_extraction::OcrPreset {
        // The core contract currently requires a canonical preset. The browser
        // adapter rewrites this provenance to the concrete OCR engine below.
        document_extraction::OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[wasm_bindgen(js_name = inspectPdf)]
pub fn inspect_pdf_json(pdf: &[u8]) -> Result<String, JsValue> {
    let pages = inspect_pdf(pdf).map_err(into_js_error)?;
    let pages = pages
        .into_iter()
        .map(|page| InspectedPage {
            page_number: page.page_number,
            embedded_text: page.embedded_text,
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&pages).map_err(into_js_error)
}

#[wasm_bindgen(js_name = assembleReadingDocument)]
pub fn assemble_reading_document(pages_json: &str) -> Result<String, JsValue> {
    let pages: Vec<BrowserPageInput> = serde_json::from_str(pages_json).map_err(into_js_error)?;
    let ocr = PrecomputedOcr {
        pages: pages
            .iter()
            .filter_map(|page| page.ocr_text.clone().map(|text| (page.page_number, text)))
            .collect(),
    };
    let inputs = pages.into_iter().map(|page| PageInput {
        page_number: page.page_number,
        embedded_text: page.embedded_text,
    });
    let mut document = extract_pages(inputs, &ocr).map_err(into_js_error)?;
    tag_browser_ocr_provenance(&mut document);
    serde_json::to_string(&document).map_err(into_js_error)
}

fn tag_browser_ocr_provenance(document: &mut ReadingDocument) {
    for page in &mut document.pages {
        if matches!(page.provenance, ExtractionProvenance::CanonicalOcr { .. }) {
            page.provenance = ExtractionProvenance::CanonicalOcr {
                preset: BROWSER_OCR_PRESET.to_string(),
            };
        }
    }
}

#[wasm_bindgen]
pub struct BrowserOcr {
    engine: OcrEngine,
}

#[wasm_bindgen]
impl BrowserOcr {
    #[wasm_bindgen(constructor)]
    pub fn new(detection_model: Vec<u8>, recognition_model: Vec<u8>) -> Result<BrowserOcr, JsValue> {
        let detection_model = Model::load(detection_model).map_err(into_js_error)?;
        let recognition_model = Model::load(recognition_model).map_err(into_js_error)?;
        let engine = OcrEngine::new(OcrEngineParams {
            detection_model: Some(detection_model),
            recognition_model: Some(recognition_model),
            ..Default::default()
        })
        .map_err(into_js_error)?;
        Ok(Self { engine })
    }

    #[wasm_bindgen(js_name = recognizeRgba)]
    pub fn recognize_rgba(
        &self,
        width: u32,
        height: u32,
        pixels: &[u8],
    ) -> Result<String, JsValue> {
        let image = ImageSource::from_bytes(pixels, (width, height)).map_err(into_js_error)?;
        let input = self.engine.prepare_input(image).map_err(into_js_error)?;
        self.engine.get_text(&input).map_err(into_js_error)
    }
}

fn into_js_error(error: impl std::fmt::Display) -> JsValue {
    js_sys::Error::new(&error.to_string()).into()
}
