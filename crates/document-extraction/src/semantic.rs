use std::fmt::Write as _;

use semantic_core::{
    Annotation, ConceptId, Confidence, EntityId, Evidence, EvidenceKey, EvidenceValue, Producer,
    ProducerId, SemanticContractError,
};

use crate::{DocumentTextEvidence, DocumentTextRole, ReadingDocument};

const DOCUMENT_ROLE_CLASSIFIER_VERSION: &str = "1";

/// Project speedreader-owned document-role classifications into the shared
/// Foundation semantic annotation contract.
///
/// This projection deliberately carries semantic claims only. Reading policy
/// such as `include_in_reading` remains part of the speedreader document model
/// and is not encoded as semantic truth.
pub fn semantic_annotations(
    document: &ReadingDocument,
) -> Result<Vec<Annotation>, SemanticContractError> {
    let document_id = semantic_document_id(document);
    let producer = Producer::new(ProducerId::new("speedreader:document-role-classifier")?)
        .with_version(DOCUMENT_ROLE_CLASSIFIER_VERSION);
    let mut annotations = Vec::new();

    for page in &document.pages {
        let page_number = page.page_number.to_string();
        for region in &page.regions {
            let source_line_index = region.source_line_index.to_string();
            let subject = EntityId::derive(&[
                "speedreader",
                "document-text-region-v1",
                document_id.as_str(),
                &page_number,
                &source_line_index,
            ]);
            let confidence = region
                .confidence
                .map(|value| Confidence::new(f64::from(value) / 100.0))
                .transpose()?;
            let evidence = region
                .evidence
                .iter()
                .copied()
                .map(document_evidence_observation)
                .collect();

            annotations.push(Annotation {
                subject,
                concept: document_role_concept(region.role),
                confidence,
                producer: Some(producer.clone()),
                evidence,
            });
        }
    }

    Ok(annotations)
}

/// Stable speedreader-owned concept identifier for a document role.
#[must_use]
pub fn document_role_concept(role: DocumentTextRole) -> ConceptId {
    ConceptId::new(match role {
        DocumentTextRole::Content => "speedreader:document-role:content",
        DocumentTextRole::Heading => "speedreader:document-role:heading",
        DocumentTextRole::Caption => "speedreader:document-role:caption",
        DocumentTextRole::Table => "speedreader:document-role:table",
        DocumentTextRole::Form => "speedreader:document-role:form",
        DocumentTextRole::Footnote => "speedreader:document-role:footnote",
        DocumentTextRole::Sidebar => "speedreader:document-role:sidebar",
        DocumentTextRole::Header => "speedreader:document-role:header",
        DocumentTextRole::Footer => "speedreader:document-role:footer",
        DocumentTextRole::PageNumber => "speedreader:document-role:page-number",
    })
    .expect("speedreader document-role concept identifiers are non-empty")
}

fn semantic_document_id(document: &ReadingDocument) -> EntityId {
    // Identity is derived only from preserved source regions and page coordinates,
    // never from filtered reading text, reading order, role assignments, or display policy.
    let mut material = String::new();
    for page in &document.pages {
        write!(material, "page:{};", page.page_number)
            .expect("writing to an in-memory string cannot fail");
        for region in &page.regions {
            write!(
                material,
                "line:{}:bytes:{}:",
                region.source_line_index,
                region.text.len()
            )
            .expect("writing to an in-memory string cannot fail");
            material.push_str(&region.text);
            material.push(';');
        }
    }

    EntityId::derive(&["speedreader", "reading-document-source-v1", &material])
}

fn document_evidence_observation(evidence: DocumentTextEvidence) -> Evidence {
    Evidence::Observation {
        feature: EvidenceKey::new(match evidence {
            DocumentTextEvidence::TopMargin => "speedreader:document-evidence:top-margin",
            DocumentTextEvidence::BottomMargin => "speedreader:document-evidence:bottom-margin",
            DocumentTextEvidence::RepeatedAcrossPages => {
                "speedreader:document-evidence:repeated-across-pages"
            }
            DocumentTextEvidence::NumericOnly => "speedreader:document-evidence:numeric-only",
            DocumentTextEvidence::SequentialPageNumber => {
                "speedreader:document-evidence:sequential-page-number"
            }
            DocumentTextEvidence::OcrBlockHint => "speedreader:document-evidence:ocr-block-hint",
            DocumentTextEvidence::BottomPageBand => {
                "speedreader:document-evidence:bottom-page-band"
            }
            DocumentTextEvidence::FootnoteMarker => {
                "speedreader:document-evidence:footnote-marker"
            }
            DocumentTextEvidence::NarrowLayoutColumn => {
                "speedreader:document-evidence:narrow-layout-column"
            }
            DocumentTextEvidence::PageEdge => "speedreader:document-evidence:page-edge",
            DocumentTextEvidence::ParallelBodyColumn => {
                "speedreader:document-evidence:parallel-body-column"
            }
            DocumentTextEvidence::SecondaryColumnSupport => {
                "speedreader:document-evidence:secondary-column-support"
            }
        })
        .expect("speedreader document evidence identifiers are non-empty"),
        value: EvidenceValue::Boolean(true),
    }
}

#[cfg(test)]
mod tests {
    use semantic_core::{Annotation, Evidence};

    use super::*;
    use crate::{
        extract_pages, extract_text, CanonicalOcr, CanonicalOcrResult, ExtractionError, PageInput,
    };
    use image_analysis_ocr::OcrPreset;

    struct FixtureOcr;

    impl CanonicalOcr for FixtureOcr {
        fn recognize_page(
            &self,
            page_number: u32,
        ) -> Result<CanonicalOcrResult, ExtractionError> {
            Ok(CanonicalOcrResult::Text(format!("scanned page {page_number}")))
        }

        fn preset(&self) -> OcrPreset {
            OcrPreset::TrOcrBasePrintedOnnx
        }
    }

    #[test]
    fn maps_existing_roles_confidence_and_evidence_without_reading_policy() {
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

        let annotations = semantic_annotations(&document).unwrap();
        let header = &annotations[0];
        assert_eq!(
            header.concept.as_str(),
            "speedreader:document-role:header"
        );
        assert_eq!(header.confidence.unwrap().get(), 0.9);
        assert!(header.evidence.iter().any(|evidence| matches!(
            evidence,
            Evidence::Observation { feature, .. }
                if feature.as_str() == "speedreader:document-evidence:top-margin"
        )));

        let page_number = &annotations[2];
        assert_eq!(
            page_number.concept.as_str(),
            "speedreader:document-role:page-number"
        );
        assert_eq!(page_number.confidence.unwrap().get(), 1.0);
        assert!(page_number.evidence.iter().any(|evidence| matches!(
            evidence,
            Evidence::Observation { feature, .. }
                if feature.as_str() == "speedreader:document-evidence:sequential-page-number"
        )));

        assert_eq!(document.text, "First body\n\nSecond body");
        let encoded = serde_json::to_string(page_number).unwrap();
        assert!(!encoded.contains("includeInReading"));
        assert!(!encoded.contains("include_in_reading"));
    }

    #[test]
    fn leaves_uncalibrated_content_claims_without_confidence() {
        let document = extract_text("Body text");
        let annotations = semantic_annotations(&document).unwrap();

        assert_eq!(annotations.len(), 1);
        assert_eq!(
            annotations[0].concept.as_str(),
            "speedreader:document-role:content"
        );
        assert_eq!(annotations[0].confidence, None);
    }

    #[test]
    fn region_identity_is_independent_of_reading_order_and_inclusion_policy() {
        let document = extract_text("First\nSecond");
        let baseline = semantic_annotations(&document).unwrap();

        let mut projected_differently = document.clone();
        projected_differently.pages[0].reading_order.region_indices.reverse();
        projected_differently.pages[0].regions[0].include_in_reading = false;
        projected_differently.text = "Second".into();
        projected_differently.pages[0].text = "Second".into();
        let changed_projection = semantic_annotations(&projected_differently).unwrap();

        assert_eq!(baseline[0].subject, changed_projection[0].subject);
        assert_eq!(baseline[1].subject, changed_projection[1].subject);
    }

    #[test]
    fn projected_claims_can_coexist_with_additional_domain_annotations() {
        let document = extract_text("Body text");
        let projected = semantic_annotations(&document).unwrap();
        let additional = Annotation {
            subject: projected[0].subject.clone(),
            concept: ConceptId::new("speedreader:document-topic:example").unwrap(),
            confidence: None,
            producer: None,
            evidence: vec![],
        };

        assert_ne!(projected[0].concept, additional.concept);
        assert_eq!(projected[0].subject, additional.subject);
    }
}
