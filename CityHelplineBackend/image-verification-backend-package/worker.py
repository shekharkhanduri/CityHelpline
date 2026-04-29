#!/usr/bin/env python3
"""
Persistent Image Validation Worker for CityHelpline Backend.

Loads the ImageVerificationPipeline once at startup, then processes validation
requests from stdin and outputs JSON results to stdout. This design avoids
reloading the heavy YOLO model on every request.

Usage:
    python worker.py

Input (stdin):
    {"command": "validate", "image_path": "/tmp/image.jpg", "complaint_category_id": 1}

Output (stdout):
    {"status": "success", "verified": true, "blur_score": 150.0, ...}
"""

import sys
import json
import logging
from pathlib import Path
from time import time
import traceback

from pipeline import ImageVerificationPipeline, verify_and_categorize
from config import BLUR_THRESHOLD, CATEGORY_NAMES, PRETRAINED_MODEL_PATH, DEVICE

# Configure logging to stderr so it doesn't interfere with JSON stdout
logging.basicConfig(
    level=logging.WARNING,
    format="[WORKER] %(levelname)s - %(message)s",
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


class ValidationWorker:
    """Worker that manages the persistent pipeline and processes requests."""
    
    def __init__(self):
        """Initialize the worker and pipeline."""
        self.pipeline = None
        self.model_version = "urban_issues_yolo_v1"
        self.initialize_pipeline()
    
    def initialize_pipeline(self):
        """Initialize the pipeline; handle missing model gracefully."""
        try:
            self.pipeline = ImageVerificationPipeline()
        except FileNotFoundError as e:
            logger.error(f"Model file not found: {e}")
            self.pipeline = None
        except Exception as e:
            logger.error(f"Failed to initialize pipeline: {e}")
            logger.error(traceback.format_exc())
            self.pipeline = None
    
    def validate_image(self, image_path: str, complaint_category_id: int = None) -> dict:
        """
        Validate a single image and return structured JSON result.
        
        Args:
            image_path: Absolute path to image file
            complaint_category_id: Optional complaint category for audit
        
        Returns:
            Dictionary with validation result (see INTERFACE.md for schema)
        """
        start_time = time()
        
        image_path = Path(image_path)
        
        # Check if model is available
        if self.pipeline is None:
            return {
                "status": "error",
                "verified": False,
                "error": f"Model file not found at {PRETRAINED_MODEL_PATH}",
                "model_version": self.model_version,
                "processing_time_ms": (time() - start_time) * 1000
            }
        
        # Check if image file exists
        if not image_path.exists():
            return {
                "status": "error",
                "verified": False,
                "error": f"Image file not found: {image_path}",
                "model_version": self.model_version,
                "processing_time_ms": (time() - start_time) * 1000
            }
        
        # Run the pipeline
        try:
            pipeline_result = self.pipeline.process_image(str(image_path))
        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            logger.error(traceback.format_exc())
            return {
                "status": "error",
                "verified": False,
                "error": f"Pipeline error: {str(e)}",
                "model_version": self.model_version,
                "processing_time_ms": (time() - start_time) * 1000
            }
        
        # Transform pipeline result into contract format
        return self._transform_pipeline_result(pipeline_result, start_time)
    
    def _transform_pipeline_result(self, pipeline_result: dict, start_time: float) -> dict:
        """
        Transform raw pipeline result into Node-Python contract format.
        
        Pipeline returns:
            - status: "valid", "blurry", "error"
            - blur_score: float
            - is_blurry: bool
            - category: str (if valid)
            - confidence: float (if valid)
            - error: str (if error)
        
        Contract requires:
            - status: "success", "failure", "error"
            - verified: bool
            - blur_score, category, confidence, etc.
        """
        elapsed_ms = (time() - start_time) * 1000
        
        base_response = {
            "model_version": self.model_version,
            "processing_time_ms": elapsed_ms,
            "blur_score": pipeline_result.get("blur_score"),
            "is_blurry": pipeline_result.get("is_blurry"),
        }
        
        # Pipeline error
        if pipeline_result.get("status") == "error":
            return {
                **base_response,
                "status": "error",
                "verified": False,
                "error": pipeline_result.get("error", "Unknown pipeline error"),
            }
        
        # Image is blurry
        if pipeline_result.get("status") == "blurry":
            return {
                **base_response,
                "status": "failure",
                "verified": False,
                "reason": "Image is too blurry to categorize",
            }
        
        # Image is valid (sharp) and categorization succeeded
        if pipeline_result.get("status") == "valid":
            category_name = pipeline_result.get("category")
            category_id = pipeline_result.get("category_id")
            confidence = pipeline_result.get("confidence")

            # Fallback: determine category_id from category name only if missing
            if category_id is None and category_name and category_name != "No Issue Detected":
                for cid, cname in CATEGORY_NAMES.items():
                    if cname == category_name:
                        category_id = cid
                        break
            
            # No detection case: valid blur but no objects found
            if category_name == "No Issue Detected" or category_id == -1:
                return {
                    **base_response,
                    "status": "failure",
                    "verified": False,
                    "reason": "No urban issue detected in image",
                    "category": None,
                    "category_id": -1,
                    "confidence": 0.0,
                }
            
            # Successful categorization
            if category_id is not None and confidence is not None:
                return {
                    **base_response,
                    "status": "success",
                    "verified": True,
                    "category": category_name,
                    "category_id": category_id,
                    "confidence": float(confidence),
                }
            
            # Edge case: valid status but no category info
            return {
                **base_response,
                "status": "failure",
                "verified": False,
                "reason": "Categorization failed or no category detected",
            }
        
        # Unexpected status
        return {
            **base_response,
            "status": "error",
            "verified": False,
            "error": f"Unexpected pipeline status: {pipeline_result.get('status')}",
        }
    
    def handle_request(self, request: dict) -> dict:
        """
        Process a single request and return result.
        
        Args:
            request: {"command": "validate", "image_path": "...", "complaint_category_id": 1}
        
        Returns:
            Response dictionary (see INTERFACE.md)
        """
        command = request.get("command")
        request_id = request.get("_request_id")
        
        if command == "validate":
            image_path = request.get("image_path")
            complaint_category_id = request.get("complaint_category_id")
            
            if not image_path:
                return {
                    "status": "error",
                    "verified": False,
                    "error": "Missing required field: image_path",
                    "model_version": self.model_version,
                    "processing_time_ms": 0
                }
            
            response = self.validate_image(image_path, complaint_category_id)
            response["_request_id"] = request_id
            return response
        
        else:
            return {
                "status": "error",
                "verified": False,
                "error": f"Unknown command: {command}",
                "model_version": self.model_version,
                "processing_time_ms": 0,
                "_request_id": request_id,
            }
    
    def run(self):
        """
        Main loop: read JSON requests from stdin, process, output JSON to stdout.
        """
        try:
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                
                try:
                    request = json.loads(line)
                    response = self.handle_request(request)
                    print(json.dumps(response), flush=True)
                
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON: {e}")
                    error_response = {
                        "status": "error",
                        "verified": False,
                        "error": f"Invalid JSON in request: {str(e)}",
                        "model_version": self.model_version,
                        "processing_time_ms": 0
                    }
                    print(json.dumps(error_response), flush=True)
                
                except Exception as e:
                    logger.error(f"Request processing error: {e}")
                    logger.error(traceback.format_exc())
                    error_response = {
                        "status": "error",
                        "verified": False,
                        "error": f"Internal error: {str(e)}",
                        "model_version": self.model_version,
                        "processing_time_ms": 0
                    }
                    print(json.dumps(error_response), flush=True)
        
        except KeyboardInterrupt:
            logger.info("Worker interrupted")
            sys.exit(0)
        except Exception as e:
            logger.error(f"Worker fatal error: {e}")
            logger.error(traceback.format_exc())
            sys.exit(1)


if __name__ == "__main__":
    worker = ValidationWorker()
    worker.run()
