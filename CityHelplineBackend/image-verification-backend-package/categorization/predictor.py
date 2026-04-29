"""
YOLO-based inference module for urban issues categorization.
Chooses the highest-confidence detected class as the image category.
"""

from pathlib import Path
from typing import Union, List, Tuple

from ultralytics import YOLO

from config import DEVICE, PRETRAINED_MODEL_PATH, INFERENCE_CONFIDENCE_THRESHOLD


class ImageCategorizer:
    """YOLO inference engine with a categorization-friendly API."""

    def __init__(
        self,
        model_path: Path = PRETRAINED_MODEL_PATH,
        device: str = DEVICE,
        num_classes: int = 0,
    ):
        self.device = device
        self.model_path = Path(model_path)
        self.num_classes = num_classes

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"YOLO weights not found: {self.model_path}. "
                "Train first with training/train_categorization.py"
            )

        self.model = YOLO(str(self.model_path))

    def categorize(self, image_path: Union[str, Path]) -> dict:
        """Run YOLO on one image and return top detected category."""
        image_path = Path(image_path)
        if not image_path.exists():
            return {
                "image_path": str(image_path),
                "status": "error",
                "error": f"Image not found: {image_path}",
            }

        try:
            preds = self.model.predict(
                source=str(image_path),
                conf=INFERENCE_CONFIDENCE_THRESHOLD,
                verbose=False,
                device=0 if self.device == "cuda" else "cpu",
            )
            pred = preds[0]
            boxes = pred.boxes
            names = pred.names

            if boxes is None or len(boxes) == 0:
                return {
                    "image_path": str(image_path),
                    "status": "success",
                    "category": "No Issue Detected",
                    "category_id": -1,
                    "confidence": 0.0,
                    "detections": [],
                }

            cls_ids = boxes.cls.tolist()
            confs = boxes.conf.tolist()

            detections = []
            top_idx = 0
            top_conf = -1.0
            for i, (cls_id, conf) in enumerate(zip(cls_ids, confs)):
                cls_id = int(cls_id)
                conf = float(conf)
                label = names.get(cls_id, str(cls_id)) if isinstance(names, dict) else str(cls_id)
                detections.append(
                    {
                        "category": label,
                        "category_id": cls_id,
                        "confidence": conf,
                    }
                )
                if conf > top_conf:
                    top_conf = conf
                    top_idx = i

            best = detections[top_idx]
            return {
                "image_path": str(image_path),
                "status": "success",
                "category": best["category"],
                "category_id": best["category_id"],
                "confidence": best["confidence"],
                "detections": detections,
            }
        except Exception as e:
            return {
                "image_path": str(image_path),
                "status": "error",
                "error": str(e),
            }

    def categorize_batch(self, image_paths: List[Union[str, Path]]) -> List[dict]:
        return [self.categorize(p) for p in image_paths]

    def get_top_k_predictions(self, image_path: Union[str, Path], k: int = 3) -> dict:
        result = self.categorize(image_path)
        if result.get("status") != "success":
            return result

        detections = result.get("detections", [])
        detections = sorted(detections, key=lambda x: x["confidence"], reverse=True)[:k]

        top_k = []
        for i, d in enumerate(detections, 1):
            top_k.append(
                {
                    "rank": i,
                    "category": d["category"],
                    "category_id": d["category_id"],
                    "confidence": d["confidence"],
                }
            )

        return {
            "image_path": result["image_path"],
            "status": "success",
            "top_k_predictions": top_k,
        }


def categorize_image(
    image_path: Union[str, Path],
    model_path: Path = PRETRAINED_MODEL_PATH,
    device: str = DEVICE,
) -> Tuple[str, float]:
    categorizer = ImageCategorizer(model_path=model_path, device=device)
    result = categorizer.categorize(image_path)
    if result.get("status") != "success":
        raise RuntimeError(result.get("error", "Categorization failed"))
    return result["category"], float(result["confidence"])


def categorize_batch(
    image_paths: List[Union[str, Path]],
    model_path: Path = PRETRAINED_MODEL_PATH,
    device: str = DEVICE,
) -> List[Tuple[str, float]]:
    categorizer = ImageCategorizer(model_path=model_path, device=device)
    results = categorizer.categorize_batch(image_paths)
    output = []
    for r in results:
        if r.get("status") == "success":
            output.append((r.get("category"), float(r.get("confidence", 0.0))))
        else:
            output.append((None, 0.0))
    return output


if __name__ == "__main__":
    print("YOLO predictor ready")
