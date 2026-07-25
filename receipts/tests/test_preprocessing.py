import io

import numpy as np
from django.test import SimpleTestCase
from PIL import Image

from receipts.ocr.preprocessing import bytes_to_cv2_image, preprocess_for_ocr


def _sample_image_bytes(size=(200, 100), color="white"):
    img = Image.new("RGB", size, color)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


class BytesToCv2ImageTests(SimpleTestCase):
    def test_decodes_valid_image(self):
        image = bytes_to_cv2_image(_sample_image_bytes())
        self.assertEqual(image.shape[:2], (100, 200))

    def test_raises_on_invalid_bytes(self):
        with self.assertRaises(ValueError):
            bytes_to_cv2_image(b"not an image")


class PreprocessForOcrTests(SimpleTestCase):
    def test_returns_single_channel_binary_image(self):
        result = preprocess_for_ocr(_sample_image_bytes())
        self.assertEqual(len(result.shape), 2)
        self.assertEqual(result.dtype, np.uint8)
        unique_values = set(np.unique(result).tolist())
        self.assertTrue(unique_values.issubset({0, 255}))
