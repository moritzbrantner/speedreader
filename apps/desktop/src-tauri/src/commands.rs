use std::{cell::RefCell, path::Path};

use document_extraction::{
    extract_pages, extract_text, inspect_pdf, CanonicalOcr, ExtractionError, ReadingDocument,
};
use hayro::{
    hayro_interpret::InterpreterSettings, hayro_syntax::Pdf, render,
    vello_cpu::color::palette::css::WHITE, RenderCache, RenderSettings,
};
use image_analysis_core::{ImagePixelFormat, ImageView};
use image_analysis_ocr::{
    OcrBackend, OcrLocalModelOptions, OcrPreset, OcrRequest, OnnxTrOcrBackend,
};
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

const READER_STATE_FILE_NAME: &str = "reader-state-v1.json";

#[derive(Debug, Clone, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum ExtractionEvent {
    Selected { file_name: String },
    Reading,
    ExtractingPdf { page_count: usize },
    RecognizingPage { page_number: u32 },
    Finished { page_count: usize },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDocument {
    file_name: String,
    document: ReadingDocument,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum OpenDocumentError {
    File(String),
    Unsupported(String),
    InvalidText(String),
    Extraction(String),
    Runtime(String),
}

trait ProgressReporter {
    fn report(&self, event: ExtractionEvent);
}

impl ProgressReporter for Channel<ExtractionEvent> {
    fn report(&self, event: ExtractionEvent) {
        let _ = self.send(event);
    }
}

#[tauri::command]
pub async fn open_document(
    app: AppHandle,
    on_progress: Channel<ExtractionEvent>,
) -> Result<Option<OpenedDocument>, OpenDocumentError> {
    tauri::async_runtime::spawn_blocking(move || select_and_open_document(&app, &on_progress))
        .await
        .map_err(|error| OpenDocumentError::Runtime(error.to_string()))?
}

#[tauri::command]
pub fn load_reader_state(app: AppHandle) -> Result<Option<String>, String> {
    let path = reader_state_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(serialized) => Ok(Some(serialized)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!(
            "Could not read reader state from {}: {error}",
            path.display()
        )),
    }
}

#[tauri::command]
pub fn save_reader_state(app: AppHandle, serialized: String) -> Result<(), String> {
    let path = reader_state_path(&app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "Reader state path has no parent directory".to_string())?;
    std::fs::create_dir_all(directory).map_err(|error| {
        format!(
            "Could not create reader state directory {}: {error}",
            directory.display()
        )
    })?;
    std::fs::write(&path, serialized).map_err(|error| {
        format!(
            "Could not write reader state to {}: {error}",
            path.display()
        )
    })
}

fn reader_state_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|directory| directory.join(READER_STATE_FILE_NAME))
        .map_err(|error| error.to_string())
}

fn select_and_open_document(
    app: &AppHandle,
    progress: &impl ProgressReporter,
) -> Result<Option<OpenedDocument>, OpenDocumentError> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Readable documents", &["txt", "text", "md", "pdf"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|file_path| {
        OpenDocumentError::File(format!(
            "The selected file is not a local path: {file_path:?}"
        ))
    })?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document")
        .to_string();
    progress.report(ExtractionEvent::Selected {
        file_name: file_name.clone(),
    });
    progress.report(ExtractionEvent::Reading);
    let bytes = std::fs::read(&path).map_err(|error| {
        OpenDocumentError::File(format!("Could not read {}: {error}", path.display()))
    })?;
    let model_root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| OpenDocumentError::Runtime(error.to_string()))?
        .join("ocr-models");
    let document = open_document_bytes(&path, bytes, &model_root, progress)?;
    progress.report(ExtractionEvent::Finished {
        page_count: document.pages.len(),
    });
    Ok(Some(OpenedDocument {
        file_name,
        document,
    }))
}

fn open_document_bytes(
    path: &Path,
    bytes: Vec<u8>,
    model_root: &Path,
    progress: &impl ProgressReporter,
) -> Result<ReadingDocument, OpenDocumentError> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("txt" | "text" | "md") => {
            let text = String::from_utf8(bytes).map_err(|error| {
                OpenDocumentError::InvalidText(format!(
                    "{} is not valid UTF-8 text: {error}",
                    path.display()
                ))
            })?;
            Ok(extract_text(&text))
        }
        Some("pdf") => {
            let pages = inspect_pdf(&bytes)
                .map_err(|error| OpenDocumentError::Extraction(error.to_string()))?;
            progress.report(ExtractionEvent::ExtractingPdf {
                page_count: pages.len(),
            });
            let ocr = LocalPdfOcr::new(&bytes, model_root, progress);
            extract_pages(pages, &ocr)
                .map_err(|error| OpenDocumentError::Extraction(error.to_string()))
        }
        _ => Err(OpenDocumentError::Unsupported(
            "Choose a UTF-8 text, Markdown, or PDF document.".to_string(),
        )),
    }
}

struct LocalPdfOcr<'a, P> {
    pdf: &'a [u8],
    model_root: &'a Path,
    progress: &'a P,
    backend: RefCell<Option<OnnxTrOcrBackend>>,
}

impl<'a, P> LocalPdfOcr<'a, P> {
    fn new(pdf: &'a [u8], model_root: &'a Path, progress: &'a P) -> Self {
        Self {
            pdf,
            model_root,
            progress,
            backend: RefCell::new(None),
        }
    }
}

impl<P: ProgressReporter> CanonicalOcr for LocalPdfOcr<'_, P> {
    fn recognize_page(&self, page_number: u32) -> Result<String, ExtractionError> {
        self.progress
            .report(ExtractionEvent::RecognizingPage { page_number });
        let pdf = Pdf::new(self.pdf.to_vec())
            .map_err(|error| ocr_error(page_number, format!("{error:?}")))?;
        let page_index = page_number
            .checked_sub(1)
            .map(|index| index as usize)
            .ok_or_else(|| ocr_error(page_number, "PDF page numbers start at one"))?;
        let page = pdf
            .pages()
            .get(page_index)
            .ok_or_else(|| ocr_error(page_number, "PDF page is missing from the renderer"))?;
        let pixmap = render(
            page,
            &RenderCache::new(),
            &InterpreterSettings::default(),
            &RenderSettings {
                x_scale: 2.0,
                y_scale: 2.0,
                bg_color: WHITE,
                ..RenderSettings::default()
            },
        );
        let rgb = pixmap
            .data_as_u8_slice()
            .as_chunks::<4>()
            .0
            .iter()
            .flat_map(|pixel| pixel[..3].iter().copied())
            .collect::<Vec<_>>();
        let image = ImageView::packed(
            u32::from(pixmap.width()),
            u32::from(pixmap.height()),
            ImagePixelFormat::Rgb24,
            &rgb,
        )
        .map_err(|error| ocr_error(page_number, error))?;

        let mut backend = self.backend.borrow_mut();
        if backend.is_none() {
            std::fs::create_dir_all(self.model_root)
                .map_err(|error| ocr_error(page_number, error))?;
            *backend = Some(
                OnnxTrOcrBackend::from_local_model(OcrLocalModelOptions {
                    preset: OcrPreset::TrOcrBasePrintedOnnx,
                    bundle_root: self.model_root.to_path_buf(),
                    auto_download: true,
                    ..OcrLocalModelOptions::default()
                })
                .map_err(|error| ocr_error(page_number, error))?,
            );
        }
        let request = OcrRequest::new().model_preset(OcrPreset::TrOcrBasePrintedOnnx);
        backend
            .as_mut()
            .ok_or_else(|| ocr_error(page_number, "OCR backend did not initialize"))?
            .recognize_image(&image, &request)
            .map(|document| document.text)
            .map_err(|error| ocr_error(page_number, error))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

fn ocr_error(page_number: u32, error: impl std::fmt::Display) -> ExtractionError {
    ExtractionError::Ocr {
        page_number,
        message: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct IgnoreProgress;

    impl ProgressReporter for IgnoreProgress {
        fn report(&self, _event: ExtractionEvent) {}
    }

    #[test]
    fn opens_plain_text_through_the_shared_document_contract() {
        let document = open_document_bytes(
            Path::new("notes.txt"),
            b"A local   document".to_vec(),
            Path::new("unused"),
            &IgnoreProgress,
        )
        .unwrap();

        assert_eq!(document.version, 1);
        assert_eq!(document.text, "A local document");
        assert_eq!(document.pages.len(), 1);
    }

    #[test]
    fn rejects_file_types_outside_the_native_picker_contract() {
        let result = open_document_bytes(
            Path::new("archive.zip"),
            Vec::new(),
            Path::new("unused"),
            &IgnoreProgress,
        );

        assert!(matches!(result, Err(OpenDocumentError::Unsupported(_))));
    }
}
