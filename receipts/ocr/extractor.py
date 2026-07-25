"""Thin wrapper around pytesseract. No filesystem or Django dependency."""
import os

import pytesseract

_tesseract_cmd = os.environ.get("TESSERACT_CMD")
if _tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = _tesseract_cmd


def extract_text(preprocessed_image):
    """Run Tesseract over a preprocessed (numpy array) image and return raw text."""
    return pytesseract.image_to_string(preprocessed_image)
