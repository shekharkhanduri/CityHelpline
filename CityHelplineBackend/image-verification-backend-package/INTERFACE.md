# Node ↔ Python Worker Interface

## Worker Request Format (Node → Python stdin)

```json
{
  "command": "validate",
  "image_path": "/tmp/complaint_image_xyz.jpg",
  "complaint_category_id": 1
}
```

**Fields:**
- `command` (string): Always "validate" for now; allows for future commands like "health_check"
- `image_path` (string): Absolute path to a local image file (downloaded from Cloudinary URL)
- `complaint_category_id` (integer, optional): The user's selected category; stored for audit but not validated against model output

---

## Worker Response Format (Python → Node stdout)

On success (one JSON object per line):

```json
{
  "status": "success",
  "verified": true,
  "blur_score": 145.7,
  "is_blurry": false,
  "category": "Pothole Issues",
  "category_id": 1,
  "confidence": 0.87,
  "model_version": "urban_issues_yolo_v1",
  "processing_time_ms": 520
}
```

On validation failure (blurry, no detection, etc.):

```json
{
  "status": "failure",
  "verified": false,
  "blur_score": 45.3,
  "is_blurry": true,
  "reason": "Image is too blurry to categorize",
  "model_version": "urban_issues_yolo_v1",
  "processing_time_ms": 310
}
```

On system error (model missing, inference crash, etc.):

```json
{
  "status": "error",
  "verified": false,
  "error": "Model file not found: /path/to/best.pt",
  "model_version": "urban_issues_yolo_v1",
  "processing_time_ms": 0
}
```

**Field Semantics:**
- `status` (string): "success" | "failure" | "error"
  - "success": Image passed blur check and categorization succeeded; `verified=true` (recommended to accept)
  - "failure": Image failed blur check or YOLO detected "No Issue"; `verified=false` (recommend rejection)
  - "error": System error (missing model, inference crash); fallback to backend VALIDATION_MODE
- `verified` (boolean): True only when status="success"; controls ENFORCE mode decision
- `blur_score` (float): Laplacian variance; higher = sharper
- `is_blurry` (boolean): True if blur_score < BLUR_THRESHOLD
- `category` (string): YOLO-inferred category name, e.g., "Pothole Issues"
- `category_id` (integer): YOLO class index (0-9)
- `confidence` (float): YOLO confidence score (0.0–1.0); only valid when status="success"
- `reason` (string): Human-readable failure reason; e.g., "Image is too blurry", "No urban issue detected"
- `error` (string): System error description; appears only on status="error"
- `model_version` (string): Identifier for the model used (for audit trail; always "urban_issues_yolo_v1" currently)
- `processing_time_ms` (float): Total wall-clock time for blur + categorization

---

## Special Cases

### No Detection (YOLO finds no boxes)
```json
{
  "status": "failure",
  "verified": false,
  "blur_score": 180.5,
  "is_blurry": false,
  "reason": "No urban issue detected in image",
  "category": null,
  "category_id": -1,
  "confidence": 0.0,
  "model_version": "urban_issues_yolo_v1",
  "processing_time_ms": 450
}
```

### Model File Missing
```json
{
  "status": "error",
  "verified": false,
  "error": "Model weights not found at /home/lawliet/CityHelpline/CityHelplineBackend/image-verification-backend-package/models/weights/yolo_runs/urban_issues_yolo/weights/best.pt",
  "model_version": "urban_issues_yolo_v1",
  "processing_time_ms": 0
}
```

---

## Node-Side Mapping to Complaint DB Schema

The Node bridge translates the Python response into complaint database fields:

| Python Field | DB Column | Mapping |
|--------------|-----------|---------|
| `verified` | `validation_status` | verified=true → "passed"; verified=false → "rejected" or "pending_validation" per mode |
| `reason` or `error` | `validation_reason` | Human-readable explanation for audit trail |
| `confidence` | `model_confidence` | Stored as-is; null if status != "success" |
| `model_version` | `model_version` | Always "urban_issues_yolo_v1" currently |
| `category` | — | Advisory only; stored in audit logs, not in complaint row |
| — | `validated_at` | Set to NOW() when status != "pending_validation" |

---

## Node Backend Validation Modes

- **OFF**: Skip Python worker entirely; set `validation_status="skipped"`
- **SHADOW**: Call Python worker; log result; always accept complaint; set `validation_status="pending_validation"`
- **ENFORCE**: Call Python worker; reject if responded with `verified=false`; set `validation_status="passed"` or `"rejected"`

---

## Error Handling in Node

1. If Python worker process crashes or times out:
   - Mode OFF: Accept complaint, set `validation_status="skipped"`
   - Mode SHADOW: Log error, accept complaint, set `validation_status="pending_validation"`, reason="Validation service unavailable"
   - Mode ENFORCE: Reject complaint with 503 Service Unavailable

2. If image file is missing or unreadable:
   - Return status="error" with error message (Python should handle)
   - Node responds with 400 or 500 depending on context

3. If image path is invalid (e.g., temp file already deleted):
   - Node catches error and falls back to mode behavior

---

## Implementation Notes

- Python worker writes one complete JSON object per line to stdout
- Node uses readline to parse responses
- No multiline JSON; no streaming
- Worker process starts once at backend startup; reused for each request
- Temp image files (from Cloudinary downloads) are cleaned up by Node after the worker responds
