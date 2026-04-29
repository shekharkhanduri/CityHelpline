"""
Blur detection module using Laplacian variance method
Detects blurry images and assigns blur scores
"""

import cv2
import numpy as np
from pathlib import Path
from typing import Union, Tuple

from config import BLUR_THRESHOLD, BLUR_KERNEL_SIZE, SUPPORTED_EXTENSIONS


def compute_blur_score(image_path: Union[str, Path]) -> float:
    """
    Compute blur score for an image using Laplacian variance.
    
    Higher variance = sharper image
    Lower variance = blurrier image
    
    Args:
        image_path: Path to image file
    
    Returns:
        Blur score (Laplacian variance). Typical range: 0-10000+
    """
    image_path = Path(image_path)
    
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")
    
    try:
        # Read image in grayscale
        image = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
        
        if image is None:
            raise ValueError(f"Failed to read image: {image_path}")
        
        # Compute Laplacian variance
        laplacian = cv2.Laplacian(image, cv2.CV_64F, ksize=BLUR_KERNEL_SIZE)
        variance = laplacian.var()
        
        return float(variance)
    
    except Exception as e:
        raise RuntimeError(f"Error computing blur score for {image_path}: {e}")


def is_blurry(image_path: Union[str, Path], threshold: float = BLUR_THRESHOLD) -> bool:
    """
    Determine if an image is blurry based on threshold.
    
    Args:
        image_path: Path to image file
        threshold: Blur score threshold. Images with score < threshold are considered blurry.
    
    Returns:
        True if image is blurry, False otherwise
    """
    try:
        score = compute_blur_score(image_path)
        return score < threshold
    except Exception as e:
        print(f"[WARNING] Error checking blur for {image_path}: {e}")
        return True  # Consider problematic images as blurry to be safe


def filter_images(
    image_dir: Path,
    threshold: float = BLUR_THRESHOLD,
    output_dir: Path = None
) -> dict:
    """
    Filter images in a directory into sharp and blurry categories.
    Optionally saves results to output directory.
    
    Args:
        image_dir: Directory containing images
        threshold: Blur score threshold
        output_dir: Optional directory to save filtered images
    
    Returns:
        Dictionary with 'sharp' and 'blurry' image paths and scores
    """
    image_dir = Path(image_dir)
    if not image_dir.exists():
        raise FileNotFoundError(f"Directory not found: {image_dir}")
    
    results = {
        "sharp": [],
        "blurry": [],
        "errors": []
    }
    
    # Create output directories if specified
    if output_dir:
        output_dir = Path(output_dir)
        (output_dir / "sharp").mkdir(parents=True, exist_ok=True)
        (output_dir / "blurry").mkdir(parents=True, exist_ok=True)
        (output_dir / "errors").mkdir(parents=True, exist_ok=True)
    
    # Process all images
    image_files = [f for f in image_dir.rglob("*") 
                   if f.suffix.lower() in SUPPORTED_EXTENSIONS]
    
    print(f"\n[FILTERING] Processing {len(image_files)} images...")
    
    for i, img_path in enumerate(image_files, 1):
        try:
            score = compute_blur_score(img_path)
            
            if score < threshold:
                results["blurry"].append({
                    "path": img_path,
                    "score": score
                })
                category = "blurry"
            else:
                results["sharp"].append({
                    "path": img_path,
                    "score": score
                })
                category = "sharp"
            
            # Copy file to output directory if specified
            if output_dir:
                import shutil
                dest = output_dir / category / img_path.name
                shutil.copy2(img_path, dest)
            
            if i % 50 == 0:
                print(f"  Processed {i}/{len(image_files)} images...")
        
        except Exception as e:
            results["errors"].append({
                "path": img_path,
                "error": str(e)
            })
            if output_dir:
                import shutil
                dest = output_dir / "errors" / img_path.name
                try:
                    shutil.copy2(img_path, dest)
                except:
                    pass
    
    # Print summary
    print(f"\n[SUMMARY]")
    print(f"  Sharp images:  {len(results['sharp'])}")
    print(f"  Blurry images: {len(results['blurry'])}")
    print(f"  Errors:        {len(results['errors'])}")
    
    if len(results['sharp']) + len(results['blurry']) > 0:
        blur_ratio = len(results['blurry']) / (len(results['sharp']) + len(results['blurry'])) * 100
        print(f"  Blur ratio:    {blur_ratio:.1f}%")
    
    return results


def get_blur_statistics(results: dict) -> dict:
    """
    Compute statistics on blur scores from filtering results.
    
    Args:
        results: Output from filter_images()
    
    Returns:
        Dictionary with statistics
    """
    all_scores = [r["score"] for r in results["sharp"]] + \
                 [r["score"] for r in results["blurry"]]
    
    if not all_scores:
        return {}
    
    return {
        "min": float(np.min(all_scores)),
        "max": float(np.max(all_scores)),
        "mean": float(np.mean(all_scores)),
        "median": float(np.median(all_scores)),
        "std": float(np.std(all_scores)),
    }


if __name__ == "__main__":
    # Demo
    print("[TEST] Blur Detection Module")
    print(f"Current threshold: {BLUR_THRESHOLD}")
