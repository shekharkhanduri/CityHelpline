# Image Validation Integration - Testing Guide

This document explains how to test the integrated image validation system for CityHelpline.

## Architecture Overview

```
User (Complaints API)
  ↓
Node Backend (complaintController)
  ↓ (multer buffer)
ImageValidationService (Node bridge)
  ↓ (temp file)
Python Worker Process (persistent)
  ↓
ImageVerificationPipeline
  ├─ BlurDetector (Laplacian variance)
  └─ ImageCategorizer (YOLO)
  ↓ (JSON response)
ImageValidationService (maps to DB schema)
  ↓
Cloudinary Upload (if not rejected)
  ↓
Database Insertion
```

## Prerequisites

### Python Environment
```bash
# Install Python dependencies
cd image-verification-backend-package
pip install -r requirements.txt
```

### Verify Model Artifact
```bash
ls -la models/weights/yolo_runs/urban_issues_yolo/weights/best.pt
# Should output: -rw-r--r-- ... best.pt (several MB)
```

### Environment Variables
```bash
# .env file
COMPLAINT_IMAGE_VALIDATION_MODE=off|shadow|enforce  # Default: off
MAX_COMPLAINT_IMAGE_MB=8
PORT=5003
# ... other env vars
```

---

## 1. Python Stack Tests

### 1.1 Pipeline Smoke Test
Verifies Python initialization, image processing, and response structure.

```bash
cd image-verification-backend-package
python tests/test_pipeline.py
```

Expected output:
```
============================================================
ImageVerificationPipeline Smoke Tests
============================================================

[Test] Model Artifacts...
✓ Model artifact check: PASS

[Test] Pipeline Initialization...
✓ Pipeline initialization: PASS

[Test] Category Mapping...
✓ Category mapping: 10 categories
  - [0] Damaged Road issues
  - [1] Pothole Issues
  ...

[Test] Blur Threshold...
✓ Blur threshold: 100.0

[Test] Pipeline Processing...
✓ Pipeline processing: PASS
  Response: status=valid, blur_score=250.5, is_blurry=False

[Test] Worker Process...
✓ Worker process: PASS
  Response: status=success, verified=True

============================================================
Summary
============================================================

✓ PASS: Model Artifacts
✓ PASS: Pipeline Initialization
✓ PASS: Category Mapping
✓ PASS: Blur Threshold
✓ PASS: Pipeline Processing
✓ PASS: Worker Process

Total: 6 passed, 0 failed, 0 skipped
============================================================
```

### 1.2 Manual Worker Test
Test the worker process by sending JSON requests directly.

```bash
# Terminal 1: Start the worker
cd image-verification-backend-package
python worker.py

# Terminal 2: Send a validation request
cat << 'EOF' | python3
import json
import subprocess
import tempfile
from PIL import Image

# Create test image
img = Image.new('RGB', (500, 500), color=(255, 255, 255))
with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
    img.save(f, format='PNG')
    img_path = f.name

# Send to worker
print(json.dumps({
    'command': 'validate',
    'image_path': img_path,
    'complaint_category_id': 1
}))
EOF
```

Expected output from worker:
```json
{
  "status": "success",
  "verified": true,
  "blur_score": 250.5,
  "is_blurry": false,
  "category": "Pothole Issues",
  "category_id": 1,
  "confidence": 0.85,
  "model_version": "urban_issues_yolo_v1",
  "processing_time_ms": 520.5
}
```

---

## 2. End-to-End Complaint API Tests

### 2.1 Setup
Start the backend server and ensure it initializes the worker.

```bash
cd CityHelplineBackend
npm install  # if needed
COMPLAINT_IMAGE_VALIDATION_MODE=off npm start
```

Expected startup logs:
```
[Server] Listening on port 5003
[Server] Initializing image validation worker...
[ImageValidation] Starting Python worker from /home/.../worker.py
[ImageValidation] Worker started successfully
[Server] Image validation worker initialized successfully
```

### 2.2 Test OFF Mode (No Validation)
```bash
curl -X POST http://localhost:5003/api/complaints \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: multipart/form-data" \
  -F "lat=12.9716" \
  -F "long=77.5946" \
  -F "category_id=1" \
  -F "description=This is a pothole on the main road, approximately 2 meters in diameter and 15 cm deep. It poses a significant hazard to vehicles." \
  -F "image=@/path/to/test_image.jpg"
```

Expected response (201 or 200):
```json
{
  "complaint_id": 123,
  "user_id": 456,
  "category_id": 1,
  "description": "This is a pothole...",
  "image_url": "https://res.cloudinary.com/...",
  "image_public_id": "cityhelpline/complaints/...",
  "validation_status": "skipped",
  "validation_reason": "Validation disabled (mode=off)",
  "model_version": "urban_issues_yolo_v1",
  "model_confidence": null,
  "validated_at": null,
  "status": "pending",
  "created_at": "2026-04-06T10:30:00Z"
}
```

### 2.3 Test SHADOW Mode (Validate but Don't Block)
```bash
export COMPLAINT_IMAGE_VALIDATION_MODE=shadow
npm start  # restart backend
```

```bash
# Same curl command as above
curl -X POST http://localhost:5003/api/complaints \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: multipart/form-data" \
  -F "lat=12.9716" \
  -F "long=77.5946" \
  -F "category_id=1" \
  -F "description=This is a pothole..." \
  -F "image=@/path/to/test_image.jpg"
```

Expected response (200):
- If model inference succeeds and image is sharp:
```json
{
  "complaint_id": 124,
  "validation_status": "passed",
  "validation_reason": "Verified: Pothole Issues (confidence: 85.0%)",
  "model_version": "urban_issues_yolo_v1",
  "model_confidence": 0.85,
  "validated_at": "2026-04-06T10:31:00Z"
}
```

- If image is blurry:
```json
{
  "complaint_id": 125,
  "validation_status": "rejected",
  "validation_reason": "Image is too blurry to categorize",
  "model_version": "urban_issues_yolo_v1",
  "model_confidence": null,
  "validated_at": "2026-04-06T10:32:00Z"
}
```

### 2.4 Test ENFORCE Mode (Validate and Block)
```bash
export COMPLAINT_IMAGE_VALIDATION_MODE=enforce
npm start  # restart backend
```

#### Case A: Valid, sharp image
```bash
curl -X POST http://localhost:5003/api/complaints \
  ... (same as above)
```

Expected response (201 - Created):
```json
{
  "complaint_id": 126,
  "validation_status": "passed",
  "...": "..."
}
```

#### Case B: Blurry image (should be rejected)
```bash
# Use a blurry test image
curl -X POST http://localhost:5003/api/complaints \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: multipart/form-data" \
  -F "..." \
  -F "image=@/path/to/blurry_image.jpg"
```

Expected response (422 - Unprocessable Entity):
```json
{
  "message": "Image is too blurry to categorize",
  "error": "Complaint image validation failed"
}
```

#### Case C: No detection (should be rejected)
```bash
# Use an image with no urban issues
curl -X POST http://localhost:5003/api/complaints \
  ... (same setup)
```

Expected response (422):
```json
{
  "message": "No urban issue detected in image"
}
```

---

## 3. Validation Mode Behavior Matrix

| Mode | Image Valid | Response | Cloudinary | DB Status | HTTP |
|------|------------|----------|-----------|-----------|------|
| **OFF** | N/A | Skipped | Upload | `skipped` | 200 |
| **SHADOW** | Sharp | Passed | Upload | `passed` | 200 |
| **SHADOW** | Blurry | Rejected | Upload | `rejected` | 200 |
| **SHADOW** | Error | Error | Upload | `pending_validation` | 200 |
| **ENFORCE** | Sharp | Passed | Upload | `passed` | 201 |
| **ENFORCE** | Blurry | Rejected | Skip | N/A | 422 |
| **ENFORCE** | Error | Error | Skip | N/A | 503 |

---

## 4. Troubleshooting

### Issue: Worker fails to start, "Model file not found"
**Problem:** `best.pt` is missing at the configured path.

**Solution:**
```bash
# Check path
ls -la image-verification-backend-package/models/weights/yolo_runs/urban_issues_yolo/weights/best.pt

# If missing, check with user or download from model training job
# The file should be several hundred MB (YOLO trained model)
```

### Issue: Worker process crashes after a few requests
**Problem:** Memory exhaustion or CUDA out-of-memory.

**Solution:**
```bash
# Force CPU inference instead
export DEVICE=cpu

# Or reduce batch sizes (if supporting future batch processing)
export INFERENCE_BATCH_SIZE=1
```

### Issue: Validation hangs or times out (30s)
**Problem:** Worker is unresponsive, likely inference stalled.

**Solution:**
```bash
# Check worker process
ps aux | grep python | grep worker.py

# Check temp directory (might be full)
du -sh /tmp/cityhelpline-validation/

# Restart backend and worker
npm stop
npm start
```

### Issue: Database fields are NULL even with ENFORCE mode
**Problem:** Validation result not being saved correctly, or mode not set.

**Solution:**
```bash
# Verify environment variable
echo $COMPLAINT_IMAGE_VALIDATION_MODE

# Check database insert in logs
grep "validation_status" server.log

# Verify service is using the param correctly
grep "validateComplaintImage" controllers/complaintController.js
```

---

## 5. Debug Logging

### Enable verbose logging
```bash
# Edit .env
LOG_LEVEL=debug

# Or pass environment
DEBUG=ImageValidation:* npm start
```

### Check logs
```bash
# Python worker logs (stderr)
tail -f /path/to/server.log | grep "Python Worker"

# Node bridge logs
tail -f /path/to/server.log | grep "ImageValidation"

# Complaint controller logs
tail -f /path/to/server.log | grep "Complaint"
```

---

## 6. Performance Metrics

**Expected latencies (on GPU):**
- Blur detection: ~50-100ms
- YOLO inference: ~300-500ms
- Total validation: ~400-600ms per image
- Cloudinary upload: ~1-3s
- Database insert: ~50-100ms

**Total API response time (ENFORCE mode):**
- Validation + Upload + DB insert: ~2-4s

**Memory usage:**
- Python worker (idle): ~400-600 MB (due to model in VRAM)
- Per request: <50 MB additional
- Node bridge: <30 MB

---

## 7. Cleanup After Testing

### Stop the backend
```bash
npm stop
```

### Clean up temp files
```bash
rm -rf /tmp/cityhelpline-validation/
```

### Reset environment variables
```bash
unset COMPLAINT_IMAGE_VALIDATION_MODE
unset LOG_LEVEL
```

---

## Summary Checklist

- [ ] Python test passes (6/6)
- [ ] Backend starts without errors
- [ ] OFF mode: Complaint created with `validation_status=skipped`
- [ ] SHADOW mode: Valid image -> `validation_status=passed`, invalid -> `validation_status=rejected`
- [ ] ENFORCE mode: Valid image -> 201, invalid -> 422
- [ ] Temp files are cleaned up
- [ ] Model artifact exists and is loaded
- [ ] Database fields updated correctly (validation_reason, model_confidence, etc.)
- [ ] Image rejection does not upload to Cloudinary (ENFORCE mode)
