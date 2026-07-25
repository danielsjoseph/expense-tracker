import pytesseract
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .ocr.pipeline import extract_transaction_fields
from .serializers import ExtractedFieldsSerializer, ReceiptUploadSerializer


class ExtractReceiptView(APIView):
    """POST one or more images, get back OCR-extracted structured fields
    for each.

    Each uploaded image is read into memory (`.read()`) and handed directly
    to the OCR pipeline as bytes. None of them are ever written to
    MEDIA_ROOT, assigned to a model field, or saved to any storage backend
    or database. Once this method returns, every image's data is discarded
    along with the request.
    """

    def post(self, request):
        upload_serializer = ReceiptUploadSerializer(data=request.data)
        upload_serializer.is_valid(raise_exception=True)

        results = []
        for image in upload_serializer.validated_data["images"]:
            image_bytes = image.read()

            try:
                fields = extract_transaction_fields(image_bytes)
            except pytesseract.TesseractNotFoundError:
                return Response(
                    {
                        "detail": (
                            "Tesseract OCR engine is not installed or not on PATH. "
                            "Install it and/or set the TESSERACT_CMD environment "
                            "variable, or enter transaction details manually."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except ValueError as exc:
                # A single unreadable image shouldn't sink the whole batch.
                results.append({"filename": image.name, "error": str(exc)})
                continue

            response_serializer = ExtractedFieldsSerializer(data=fields)
            response_serializer.is_valid(raise_exception=True)
            results.append({"filename": image.name, **response_serializer.validated_data})

        return Response({"results": results})
