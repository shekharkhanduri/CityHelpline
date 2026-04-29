"""
Central configuration for Image Verification Module
"""

import os
from pathlib import Path

# ==================== PROJECT PATHS ====================
PROJECT_ROOT = Path(__file__).parent
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "models"
MODEL_WEIGHTS_DIR = MODELS_DIR / "weights"


def resolve_urban_issues_raw() -> Path:
    """Resolve the urban issues dataset path for local or Kaggle environments."""
    env_path = os.environ.get("URBAN_ISSUES_RAW")
    if env_path:
        return Path(env_path)

    kaggle_input = Path("/kaggle/input")
    if kaggle_input.exists():
        candidates = sorted(
            [p for p in kaggle_input.iterdir() if p.is_dir()],
            key=lambda p: p.name.lower(),
        )
        for candidate in candidates:
            if "urban" in candidate.name.lower() and "issue" in candidate.name.lower():
                return candidate
        if candidates:
            return candidates[0]

    return DATA_DIR / "urban_issues_raw"


URBAN_ISSUES_RAW = resolve_urban_issues_raw()

# Create necessary directories
MODEL_WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

# ==================== BLUR DETECTION ====================
# Laplacian variance threshold for blur detection
# Higher = stricter (filters more images as blurry)
BLUR_THRESHOLD = 100.0  # Medium strictness
BLUR_KERNEL_SIZE = 3

# ==================== IMAGE CATEGORIZATION ====================
# Urban issues categories (10 classes)
CATEGORY_NAMES = {
    0: "Damaged Road issues",
    1: "Pothole Issues",
    2: "Illegal Parking Issues",
    3: "Broken Road Sign Issues",
    4: "Fallen trees",
    5: "Littering/Garbage on Public Places",
    6: "Vandalism Issues",
    7: "Dead Animal Pollution",
    8: "Damaged concrete structures",
    9: "Damaged Electric wires and poles"
}

NUM_CLASSES = len(CATEGORY_NAMES)

# Index to category name mapping
IDX_TO_CATEGORY = CATEGORY_NAMES
CATEGORY_TO_IDX = {v: k for k, v in CATEGORY_NAMES.items()}

# ==================== MODEL CONFIGURATION ====================
MODEL_ARCHITECTURE = "yolov8"
YOLO_MODEL_VARIANT = os.environ.get("YOLO_MODEL_VARIANT", "yolov8n.pt")
YOLO_PROJECT_DIR = MODEL_WEIGHTS_DIR / "yolo_runs"
PRETRAINED_MODEL_PATH = YOLO_PROJECT_DIR / "urban_issues_yolo" / "weights" / "best.pt"

# Model input size (ResNet50 standard)
IMG_RESIZE_SIZE = 256  # Resize to this size before center crop
IMG_CROP_SIZE = 224    # Center crop to this size
IMG_MEAN = [0.485, 0.456, 0.406]  # ImageNet normalization
IMG_STD = [0.229, 0.224, 0.225]

# ==================== TRAINING CONFIGURATION ====================
TRAIN_BATCH_SIZE = 32
VAL_BATCH_SIZE = 64
TEST_BATCH_SIZE = 64

NUM_EPOCHS = 50
LEARNING_RATE = 1e-4
WEIGHT_DECAY = 1e-5
PATIENCE_EARLY_STOPPING = 10  # Stop if no improvement for N epochs

# Train/Val/Test split ratios
TRAIN_SPLIT = 0.8
VAL_SPLIT = 0.1
TEST_SPLIT = 0.1

# ==================== DATA AUGMENTATION ====================
# Controls intensity of augmentation during training
AUGMENTATION_CONFIG = {
    "random_horizontal_flip": True,
    "random_vertical_flip": False,
    "random_rotation": 15,  # degrees
    "brightness_factor": 0.2,
    "contrast_factor": 0.2,
    "saturation_factor": 0.2,
    "hue_factor": 0.1,
}

# ==================== DEVICE CONFIGURATION ====================
DEVICE = "cuda" if __import__("torch").cuda.is_available() else "cpu"

# ==================== INFERENCE CONFIGURATION ====================
INFERENCE_CONFIDENCE_THRESHOLD = 0.3  # Minimum confidence to return a prediction

# ==================== MODEL ARTIFACT VERIFICATION ====================
def verify_model_artifacts():
    """
    Verify that required model artifacts exist.
    Returns: (is_valid, error_message)
    """
    if not PRETRAINED_MODEL_PATH.exists():
        return (False, f"YOLO model weights not found at {PRETRAINED_MODEL_PATH}")
    
    return (True, None)


# ==================== DATA FORMAT ====================
# Supported image extensions
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif"}

# Verify model artifacts on config load
is_valid, error_msg = verify_model_artifacts()
if not is_valid:
    print(f"[CONFIG WARNING] {error_msg}")
