"""
Main pipeline integrating blur detection and image categorization
Chains: blur detection → (if sharp) categorization
"""

from pathlib import Path
from typing import Union, Dict, Optional
import time

from blur_detection.detector import is_blurry, compute_blur_score
from categorization.predictor import ImageCategorizer
from config import BLUR_THRESHOLD, PRETRAINED_MODEL_PATH, DEVICE


class ImageVerificationPipeline:
    """End-to-end image verification and categorization pipeline"""
    
    def __init__(
        self,
        blur_threshold: float = BLUR_THRESHOLD,
        model_path: Path = PRETRAINED_MODEL_PATH,
        device: str = DEVICE
    ):
        """
        Initialize the pipeline.
        
        Args:
            blur_threshold: Blur detection threshold
            model_path: Path to categorization model weights
            device: Device to use for inference
        """
        self.blur_threshold = blur_threshold
        self.model_path = Path(model_path)
        self.device = device
        
        # Initialize categorizer
        try:
            self.categorizer = ImageCategorizer(
                model_path=model_path,
                device=device
            )
        except Exception as e:
            print(f"[WARNING] Failed to initialize categorizer: {e}")
            self.categorizer = None
    
    def process_image(
        self,
        image_path: Union[str, Path]
    ) -> Dict:
        """
        Process a single image through the full pipeline.
        
        Args:
            image_path: Path to image
        
        Returns:
            Dictionary with results:
                - status: "valid", "blurry", or "error"
                - blur_score: Blur score value
                - is_blurry: Boolean
                - category: Category name (if valid & model available)
                - confidence: Confidence score (if valid & model available)
                - timestamp: Processing timestamp
                - processing_time_ms: Total processing time
        """
        image_path = Path(image_path)
        start_time = time.time()
        
        result = {
            "image_path": str(image_path),
            "status": None,
            "blur_score": None,
            "is_blurry": None,
            "category": None,
            "category_id": None,
            "confidence": None,
            "detections": None,
            "error": None,
        }
        
        # Verify image exists
        if not image_path.exists():
            result["status"] = "error"
            result["error"] = f"Image file not found: {image_path}"
            result["processing_time_ms"] = (time.time() - start_time) * 1000
            return result
        
        # Step 1: Blur detection
        try:
            blur_score = compute_blur_score(image_path)
            result["blur_score"] = blur_score
            result["is_blurry"] = blur_score < self.blur_threshold
            
            if result["is_blurry"]:
                result["status"] = "blurry"
                result["processing_time_ms"] = (time.time() - start_time) * 1000
                return result
        
        except Exception as e:
            result["status"] = "error"
            result["error"] = f"Blur detection failed: {e}"
            result["processing_time_ms"] = (time.time() - start_time) * 1000
            return result
        
        # Step 2: Image categorization (if sharp and model available)
        if self.categorizer:
            try:
                categorization_result = self.categorizer.categorize(image_path)
                
                if categorization_result["status"] == "success":
                    result["status"] = "valid"
                    result["category"] = categorization_result["category"]
                    result["category_id"] = categorization_result.get("category_id")
                    result["confidence"] = categorization_result["confidence"]
                    result["detections"] = categorization_result.get("detections", [])
                else:
                    result["status"] = "error"
                    result["error"] = categorization_result.get("error", "Categorization failed")
            
            except Exception as e:
                result["status"] = "error"
                result["error"] = f"Categorization failed: {e}"
        else:
            result["status"] = "valid"  # Sharp but no categorization model
        
        result["processing_time_ms"] = (time.time() - start_time) * 1000
        return result
    
    def process_batch(
        self,
        image_paths: list,
        verbose: bool = True
    ) -> list:
        """
        Process multiple images through the pipeline.
        
        Args:
            image_paths: List of image paths
            verbose: Whether to print progress
        
        Returns:
            List of result dictionaries
        """
        results = []
        
        for i, img_path in enumerate(image_paths, 1):
            if verbose and i % 10 == 0:
                print(f"[PROGRESS] Processing {i}/{len(image_paths)}...")
            
            result = self.process_image(img_path)
            results.append(result)
        
        if verbose:
            self._print_batch_summary(results)
        
        return results
    
    def _print_batch_summary(self, results: list) -> None:
        """Print summary statistics for batch processing (disabled for production)"""
        pass
    
    def summary_report(self, results: list) -> dict:
        """Generate summary report for batch results"""
        valid_count = sum(1 for r in results if r["status"] == "valid")
        blurry_count = sum(1 for r in results if r["status"] == "blurry")
        error_count = sum(1 for r in results if r["status"] == "error")
        
        categories = {}
        for r in results:
            if r["status"] == "valid" and r["category"]:
                cat = r["category"]
                categories[cat] = categories.get(cat, 0) + 1
        
        return {
            "total": len(results),
            "valid": valid_count,
            "blurry": blurry_count,
            "errors": error_count,
            "categories": categories,
        }


def verify_and_categorize(
    image_path: Union[str, Path],
    blur_threshold: float = BLUR_THRESHOLD
) -> Dict:
    """
    Convenience function to verify and categorize a single image.
    
    Args:
        image_path: Path to image
        blur_threshold: Blur detection threshold
    
    Returns:
        Dictionary with results
    """
    pipeline = ImageVerificationPipeline(blur_threshold=blur_threshold)
    return pipeline.process_image(image_path)


if __name__ == "__main__":
    print("[TEST] Image Verification Pipeline")
    pipeline = ImageVerificationPipeline()
    print("Pipeline ready for use")
