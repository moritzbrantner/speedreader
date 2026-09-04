use std::{cell::RefCell, path::Path};

use document_extraction::{
    extract_pages, extract_text, inspect_pdf, CanonicalOcr, CanonicalOcrResult, ExtractionError,
    ReadingDocument,
};
use hayro::{
    hayro_interpret::InterpreterSettings, hayro_syntax::Pdf, render,
    vello_cpu::color::palette::css::WHITE, RenderCache, RenderSettings,
};
use image_analysis_core::{ImagePixelFormat, ImageView, OwnedImage};
use image_analysis_ocr::{
    OcrBackend, OcrDocument, OcrLocalModelOptions, OcrPreset, OcrRequest, OcrTextBlock,
    OcrTextLine, OnnxTrOcrBackend,
};
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use video_analysis_core::BoundingBox;

const READER_STATE_FILE_NAME: &str = "reader-state-v1.json";
const PRINTED_TEXT_LUMA_THRESHOLD: u8 = 210;
const MIN_REGION_INK_PIXELS: usize = 8;
const MAX_SEGMENTS_PER_PAGE: usize = 256;

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
    fn recognize_page(&self, page_number: u32) -> Result<CanonicalOcrResult, ExtractionError> {
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
        let document = recognize_segmented_page(
            backend
                .as_mut()
                .ok_or_else(|| ocr_error(page_number, "OCR backend did not initialize"))?,
            &image,
            &request,
        )
        .map_err(|error| ocr_error(page_number, error))?;
        Ok(CanonicalOcrResult::Structured(document))
    }

    fn preset(&self) -> OcrPreset {
        OcrPreset::TrOcrBasePrintedOnnx
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PageRegion {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

impl PageRegion {
    fn bounding_box(self) -> Result<BoundingBox, String> {
        BoundingBox::new(self.x, self.y, self.width, self.height).map_err(|error| error.to_string())
    }
}

fn recognize_segmented_page(
    backend: &mut impl OcrBackend,
    image: &ImageView<'_>,
    request: &OcrRequest,
) -> Result<OcrDocument, String> {
    if !request.preserve_layout {
        return backend
            .recognize_image(image, request)
            .map_err(|error| error.to_string());
    }

    let segments = detect_printed_text_regions(image)?;
    if segments.is_empty() {
        return backend
            .recognize_image(image, request)
            .map_err(|error| error.to_string());
    }

    let mut texts = Vec::new();
    let mut blocks = Vec::new();
    let mut language = None;
    let mut attributes = None;

    for segment in segments.iter().copied() {
        let crop = crop_page_region(image, segment)?;
        let mut recognized = backend
            .recognize_image(&crop.as_view(), request)
            .map_err(|error| error.to_string())?;
        let text = recognized.text.trim().to_string();
        if text.is_empty() {
            continue;
        }
        if language.is_none() {
            language = recognized.language.clone();
        }
        if attributes.is_none() {
            attributes = Some(recognized.attributes.clone());
        }
        texts.push(text.clone());
        let global_region = segment.bounding_box()?;

        if recognized.blocks.is_empty() {
            blocks.push(
                OcrTextBlock::paragraph(text.clone())
                    .map_err(|error| error.to_string())?
                    .region(global_region)
                    .line(
                        OcrTextLine::new(text)
                            .map_err(|error| error.to_string())?
                            .region(global_region),
                    ),
            );
            continue;
        }

        for mut block in recognized.blocks.drain(..) {
            block.region = Some(match block.region {
                Some(region) => translate_region(region, segment)?,
                None => global_region,
            });
            for line in &mut block.lines {
                line.region = Some(match line.region {
                    Some(region) => translate_region(region, segment)?,
                    None => global_region,
                });
                for token in &mut line.tokens {
                    if let Some(region) = token.region {
                        token.region = Some(translate_region(region, segment)?);
                    }
                }
            }
            blocks.push(block);
        }
    }

    if texts.is_empty() {
        return backend
            .recognize_image(image, request)
            .map_err(|error| error.to_string());
    }

    let mut document = OcrDocument::new(texts.join("\n"), image.width, image.height)
        .map_err(|error| error.to_string())?;
    document.blocks = blocks;
    document.language = language;
    document.attributes = attributes.unwrap_or_default();
    document
        .attributes
        .insert("layoutMode".to_string(), "segmented_printed_page".to_string());
    document
        .attributes
        .insert("segmentCount".to_string(), texts.len().to_string());
    Ok(document)
}

fn translate_region(region: BoundingBox, parent: PageRegion) -> Result<BoundingBox, String> {
    let x = parent
        .x
        .checked_add(region.x)
        .ok_or_else(|| "OCR region x coordinate overflowed".to_string())?;
    let y = parent
        .y
        .checked_add(region.y)
        .ok_or_else(|| "OCR region y coordinate overflowed".to_string())?;
    BoundingBox::new(x, y, region.width, region.height).map_err(|error| error.to_string())
}

fn detect_printed_text_regions(image: &ImageView<'_>) -> Result<Vec<PageRegion>, String> {
    image.validate().map_err(|error| error.to_string())?;
    let min_row_ink = (image.width / 800).max(2) as usize;
    let max_row_gap = (image.height / 1000).clamp(1, 4);
    let max_text_band_height = (image.height / 10).max(12);
    let horizontal_gap = (image.width / 20).max(12);
    let padding_x = (image.width / 500).clamp(2, 8);
    let padding_y = (image.height / 1000).clamp(2, 8);

    let active_rows = (0..image.height)
        .filter(|y| {
            let ink = (0..image.width)
                .filter(|x| image.luma(*x, *y) <= PRINTED_TEXT_LUMA_THRESHOLD)
                .take(min_row_ink)
                .count();
            ink >= min_row_ink
        })
        .collect::<Vec<_>>();
    let row_bands = spans_from_active_positions(&active_rows, max_row_gap);
    let mut regions = Vec::new();

    for (top, bottom) in row_bands {
        let band_height = bottom.saturating_sub(top);
        if band_height > max_text_band_height {
            return Ok(Vec::new());
        }

        let active_columns = (0..image.width)
            .filter(|x| {
                (top..bottom)
                    .any(|y| image.luma(*x, y) <= PRINTED_TEXT_LUMA_THRESHOLD)
            })
            .collect::<Vec<_>>();
        for (left, right) in spans_from_active_positions(&active_columns, horizontal_gap) {
            let width = right.saturating_sub(left);
            if width < 3 || band_height < 3 {
                continue;
            }
            let ink_pixels = (top..bottom)
                .flat_map(|y| (left..right).map(move |x| (x, y)))
                .filter(|(x, y)| image.luma(*x, *y) <= PRINTED_TEXT_LUMA_THRESHOLD)
                .take(MIN_REGION_INK_PIXELS)
                .count();
            if ink_pixels < MIN_REGION_INK_PIXELS {
                continue;
            }

            let x = left.saturating_sub(padding_x);
            let y = top.saturating_sub(padding_y);
            let padded_right = right.saturating_add(padding_x).min(image.width);
            let padded_bottom = bottom.saturating_add(padding_y).min(image.height);
            regions.push(PageRegion {
                x,
                y,
                width: padded_right.saturating_sub(x),
                height: padded_bottom.saturating_sub(y),
            });
            if regions.len() > MAX_SEGMENTS_PER_PAGE {
                return Ok(Vec::new());
            }
        }
    }

    regions.sort_by_key(|region| (region.y, region.x));
    Ok(regions)
}

fn spans_from_active_positions(active: &[u32], max_gap: u32) -> Vec<(u32, u32)> {
    let Some(first) = active.first().copied() else {
        return Vec::new();
    };
    let mut spans = Vec::new();
    let mut start = first;
    let mut previous = first;

    for position in active.iter().copied().skip(1) {
        let gap = position.saturating_sub(previous).saturating_sub(1);
        if gap > max_gap {
            spans.push((start, previous.saturating_add(1)));
            start = position;
        }
        previous = position;
    }
    spans.push((start, previous.saturating_add(1)));
    spans
}

fn crop_page_region(image: &ImageView<'_>, region: PageRegion) -> Result<OwnedImage, String> {
    let bytes_per_pixel = image.pixel_format.bytes_per_pixel();
    let row_bytes = region.width as usize * bytes_per_pixel;
    let mut data = Vec::with_capacity(row_bytes * region.height as usize);
    for y in region.y..region.y.saturating_add(region.height) {
        let start = y as usize * image.stride + region.x as usize * bytes_per_pixel;
        let end = start + row_bytes;
        let row = image
            .data
            .get(start..end)
            .ok_or_else(|| "OCR crop exceeded the rendered page buffer".to_string())?;
        data.extend_from_slice(row);
    }
    OwnedImage::new(
        region.width,
        region.height,
        image.pixel_format,
        data,
        row_bytes,
    )
    .map_err(|error| error.to_string())
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

    #[test]
    fn detects_separate_printed_lines() {
        let image = synthetic_page(
            240,
            140,
            &[
                PageRegion { x: 20, y: 20, width: 120, height: 8 },
                PageRegion { x: 20, y: 70, width: 140, height: 8 },
            ],
        );
        let regions = detect_printed_text_regions(&image.as_view()).unwrap();

        assert_eq!(regions.len(), 2);
        assert!(regions[0].y < regions[1].y);
    }

    #[test]
    fn splits_parallel_columns_inside_the_same_text_band() {
        let image = synthetic_page(
            400,
            150,
            &[
                PageRegion { x: 20, y: 20, width: 130, height: 8 },
                PageRegion { x: 250, y: 20, width: 130, height: 8 },
                PageRegion { x: 20, y: 80, width: 130, height: 8 },
                PageRegion { x: 250, y: 80, width: 130, height: 8 },
            ],
        );
        let regions = detect_printed_text_regions(&image.as_view()).unwrap();

        assert_eq!(regions.len(), 4);
        assert!(regions[0].x < regions[1].x);
        assert!(regions[0].y < regions[2].y);
    }

    #[test]
    fn ignores_single_pixel_noise() {
        let mut data = vec![255_u8; 120 * 80];
        data[10 * 120 + 10] = 0;
        let image = OwnedImage::new_gray(120, 80, data).unwrap();

        assert!(detect_printed_text_regions(&image.as_view())
            .unwrap()
            .is_empty());
    }

    #[test]
    fn ambiguous_large_dark_bands_fall_back_to_whole_page_ocr() {
        let image = synthetic_page(
            200,
            200,
            &[PageRegion { x: 20, y: 20, width: 160, height: 80 }],
        );
        let mut backend = FixtureBackend::default();
        let request = OcrRequest::new().preserve_layout(true);

        let document = recognize_segmented_page(&mut backend, &image.as_view(), &request).unwrap();

        assert_eq!(backend.calls, 1);
        assert_eq!(document.width, 200);
        assert_eq!(document.height, 200);
    }

    #[test]
    fn segmented_ocr_returns_global_block_regions() {
        let image = synthetic_page(
            240,
            140,
            &[
                PageRegion { x: 20, y: 20, width: 120, height: 8 },
                PageRegion { x: 20, y: 70, width: 140, height: 8 },
            ],
        );
        let mut backend = FixtureBackend::default();
        let request = OcrRequest::new().preserve_layout(true);

        let document = recognize_segmented_page(&mut backend, &image.as_view(), &request).unwrap();

        assert_eq!(backend.calls, 2);
        assert_eq!(document.text, "segment 1\nsegment 2");
        assert_eq!(document.blocks.len(), 2);
        let first = document.blocks[0].region.unwrap();
        let second = document.blocks[1].region.unwrap();
        assert!(first.y < second.y);
        assert_eq!(
            document.attributes.get("layoutMode").map(String::as_str),
            Some("segmented_printed_page")
        );
    }

    #[test]
    fn layout_disabled_preserves_single_page_backend_call() {
        let image = synthetic_page(
            240,
            140,
            &[
                PageRegion { x: 20, y: 20, width: 120, height: 8 },
                PageRegion { x: 20, y: 70, width: 140, height: 8 },
            ],
        );
        let mut backend = FixtureBackend::default();
        let request = OcrRequest::new().preserve_layout(false);

        let document = recognize_segmented_page(&mut backend, &image.as_view(), &request).unwrap();

        assert_eq!(backend.calls, 1);
        assert_eq!(document.width, 240);
        assert_eq!(document.height, 140);
        assert!(document.blocks[0].region.is_none());
    }

    #[derive(Default)]
    struct FixtureBackend {
        calls: usize,
    }

    impl OcrBackend for FixtureBackend {
        fn recognize_image(
            &mut self,
            image: &ImageView<'_>,
            _request: &OcrRequest,
        ) -> video_analysis_core::Result<OcrDocument> {
            self.calls += 1;
            let text = format!("segment {}", self.calls);
            Ok(OcrDocument::new(text.clone(), image.width, image.height)?
                .block(OcrTextBlock::paragraph(text.clone())?.line(OcrTextLine::new(text)?)))
        }
    }

    fn synthetic_page(width: u32, height: u32, ink: &[PageRegion]) -> OwnedImage {
        let mut data = vec![255_u8; width as usize * height as usize];
        for region in ink {
            for y in region.y..region.y.saturating_add(region.height).min(height) {
                for x in region.x..region.x.saturating_add(region.width).min(width) {
                    data[y as usize * width as usize + x as usize] = 0;
                }
            }
        }
        OwnedImage::new_gray(width, height, data).unwrap()
    }
}
