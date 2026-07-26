"""Image preprocessing to improve OCR accuracy on real-world receipt photos.

Pure image-processing code: takes raw image bytes in, returns a processed
numpy array out. No filesystem or Django dependency.
"""
import cv2
import numpy as np

# Phone camera photos routinely come in at 3000-4000px+ on the long side.
# Tesseract needs nowhere near that much resolution for a receipt (a simple
# text document, not fine detail), and cv2.fastNlMeansDenoising's runtime
# scales with pixel count — at full resolution, a handful of receipts in one
# batch was slow/memory-heavy enough to trip gunicorn's worker timeout in
# production. Downscaling first cuts CPU time and memory substantially with
# no meaningful OCR accuracy loss.
_MAX_DIMENSION = 1800


def _downscale_if_needed(image):
    height, width = image.shape[:2]
    longest_side = max(height, width)
    if longest_side <= _MAX_DIMENSION:
        return image

    scale = _MAX_DIMENSION / longest_side
    new_size = (round(width * scale), round(height * scale))
    return cv2.resize(image, new_size, interpolation=cv2.INTER_AREA)


def bytes_to_cv2_image(image_bytes):
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image data")
    return image


def _deskew(gray):
    coords = np.column_stack(np.where(gray < 255))
    if coords.size == 0:
        return gray

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    if abs(angle) < 0.5:
        return gray

    (h, w) = gray.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        gray, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


def preprocess_for_ocr(image_bytes):
    """Downscale -> grayscale -> denoise -> deskew -> adaptive threshold,
    ready for Tesseract."""
    image = bytes_to_cv2_image(image_bytes)
    image = _downscale_if_needed(image)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    deskewed = _deskew(denoised)
    thresholded = cv2.adaptiveThreshold(
        deskewed,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        11,
    )
    return thresholded
