"""Ties preprocessing -> Tesseract -> parsing together. No Django dependency.

Operates entirely on in-memory bytes / numpy arrays; nothing here touches
the filesystem, so callers are responsible for never persisting the
original image.
"""
from .categorize import guess_category
from .extractor import extract_text
from .parser import parse_receipt_text
from .preprocessing import preprocess_for_ocr


def extract_transaction_fields(image_bytes):
    preprocessed = preprocess_for_ocr(image_bytes)
    raw_text = extract_text(preprocessed)
    fields = parse_receipt_text(raw_text)
    fields["category"] = guess_category(fields.pop("merchant", ""))
    fields["raw_ocr_text"] = raw_text
    return fields
