use std::collections::BTreeMap;

use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use document_extraction::{
    extract_pages, CanonicalOcr, ExtractionError, PageInput, ReadingDocument,
};
use image_analysis_ocr::OcrPreset;
use serde::Deserialize;

#[derive(Clone)]
struct AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractRequest {
    pages: Vec<ExtractRequestPage>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractRequestPage {
    page_number: u32,
    embedded_text: String,
    ocr_text: Option<String>,
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/extract", post(extract))
        .with_state(AppState);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
        .await
        .expect("server bind address is a fixed local invariant");
    axum::serve(listener, app)
        .await
        .expect("server should run until the process is stopped");
}

async fn extract(
    State(_state): State<AppState>,
    Json(request): Json<ExtractRequest>,
) -> Result<Json<ReadingDocument>, (StatusCode, String)> {
    let ocr = RequestOcr::from_pages(&request.pages);
    extract_pages(
        request.pages.into_iter().map(|page| PageInput {
            page_number: page.page_number,
            embedded_text: page.embedded_text,
        }),
        &ocr,
    )
    .map(Json)
    .map_err(|error| (StatusCode::UNPROCESSABLE_ENTITY, error.to_string()))
}

struct RequestOcr(BTreeMap<u32, String>);

impl RequestOcr {
    fn from_pages(pages: &[ExtractRequestPage]) -> Self {
        Self(
            pages
                .iter()
                .filter_map(|page| page.ocr_text.clone().map(|text| (page.page_number, text)))
                .collect(),
        )
    }
}

impl CanonicalOcr for RequestOcr {
    fn recognize_page(&self, page_number: u32) -> Result<String, ExtractionError> {
        self.0.get(&page_number).cloned().ok_or_else(|| ExtractionError::Ocr {
            page_number,
            message: "no canonical OCR result was supplied by the configured adapter".into(),
        })
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}
