#!/usr/bin/env python3
"""
Smoke test for the ImageVerificationPipeline.

Verifies:
- Pipeline initializes successfully (or reports missing model gracefully)
- Can process sample images from test fixtures
- Returns expected JSON response structure
- Worker process can be started and responds to requests

Run: python -m pytest tests/test_pipeline.py -v
Or: python tests/test_pipeline.py
"""

import sys
import json
import subprocess
import tempfile
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from pipeline import ImageVerificationPipeline
from config import BLUR_THRESHOLD, CATEGORY_NAMES, verify_model_artifacts


def test_model_artifacts():
    """Verify model artifacts exist."""
    is_valid, error_msg = verify_model_artifacts()
    print(f"✓ Model artifact check: {'PASS' if is_valid else 'FAIL'}")
    if not is_valid:
        print(f"  Warning: {error_msg}")
        return False
    return True


def test_pipeline_initialization():
    """Test pipeline initializes successfully."""
    try:
        pipeline = ImageVerificationPipeline()
        print("✓ Pipeline initialization: PASS")
        return True
    except Exception as e:
        print(f"✗ Pipeline initialization: FAIL - {e}")
        return False


def test_pipeline_with_test_image():
    """Test pipeline can process an image."""
    # Create a simple test image (1x1 white PNG) in memory
    try:
        from PIL import Image
        import io
        
        # Create a sharp test image (1000x1000 white image)
        img_array = Image.new('RGB', (1000, 1000), color=(255, 255, 255))
        
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            img_array.save(f, format='PNG')
            temp_path = f.name
        
        # Test with pipeline
        pipeline = ImageVerificationPipeline()
        result = pipeline.process_image(temp_path)
        
        # Verify response structure
        required_fields = ['status', 'blur_score', 'is_blurry', 'processing_time_ms']
        for field in required_fields:
            if field not in result:
                print(f"✗ Pipeline processing: FAIL - missing field '{field}'")
                return False
        
        print(f"✓ Pipeline processing: PASS")
        print(f"  Response: status={result['status']}, blur_score={result['blur_score']:.1f}, is_blurry={result['is_blurry']}")
        
        # Clean up
        Path(temp_path).unlink(missing_ok=True)
        return True
    
    except ImportError:
        print("⊘ Pipeline processing: SKIP (PIL not available for test image creation)")
        return None
    except Exception as e:
        print(f"✗ Pipeline processing: FAIL - {e}")
        return False


def test_worker_process():
    """Test worker process can be started and responds."""
    try:
        worker_path = Path(__file__).parent / 'worker.py'
        if not worker_path.exists():
            print(f"⊘ Worker process: SKIP (worker.py not found at {worker_path})")
            return None
        
        # Start worker
        proc = subprocess.Popen(
            ['python3', str(worker_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(worker_path.parent),
            text=True,
            bufsize=1
        )
        
        # Create a temp test image
        try:
            from PIL import Image
            img_array = Image.new('RGB', (1000, 1000), color=(255, 255, 255))
            with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
                img_array.save(f, format='PNG')
                temp_path = f.name
        except ImportError:
            print("⊘ Worker process: SKIP (PIL not available)")
            proc.terminate()
            return None
        
        # Send a validation request
        request = {
            'command': 'validate',
            'image_path': temp_path,
            'complaint_category_id': 1
        }
        
        proc.stdin.write(json.dumps(request) + '\n')
        proc.stdin.flush()
        
        # Read response with timeout
        import select
        ready, _, _ = select.select([proc.stdout], [], [], 5.0)
        
        if not ready:
            proc.terminate()
            print("✗ Worker process: FAIL - timeout waiting for response")
            Path(temp_path).unlink(missing_ok=True)
            return False
        
        response_line = proc.stdout.readline()
        response = json.loads(response_line)
        
        # Verify response structure
        required_fields = ['status', 'verified', 'model_version', 'processing_time_ms']
        for field in required_fields:
            if field not in response:
                print(f"✗ Worker process: FAIL - missing field '{field}'")
                proc.terminate()
                Path(temp_path).unlink(missing_ok=True)
                return False
        
        proc.terminate()
        proc.wait(timeout=5)
        
        print(f"✓ Worker process: PASS")
        print(f"  Response: status={response['status']}, verified={response['verified']}")
        
        Path(temp_path).unlink(missing_ok=True)
        return True
    
    except Exception as e:
        print(f"✗ Worker process: FAIL - {e}")
        return False


def test_category_mapping():
    """Test category names are correctly configured."""
    print(f"✓ Category mapping: {len(CATEGORY_NAMES)} categories")
    for idx, name in CATEGORY_NAMES.items():
        print(f"  - [{idx}] {name}")
    
    if len(CATEGORY_NAMES) != 10:
        print(f"⚠ Warning: Expected 10 categories, found {len(CATEGORY_NAMES)}")
        return False
    return True


def test_blur_threshold():
    """Test blur threshold is set."""
    print(f"✓ Blur threshold: {BLUR_THRESHOLD}")
    if BLUR_THRESHOLD <= 0:
        print("✗ Blur threshold is invalid (must be > 0)")
        return False
    return True


def main():
    """Run all smoke tests."""
    print("\n" + "="*60)
    print("ImageVerificationPipeline Smoke Tests")
    print("="*60 + "\n")
    
    tests = [
        ("Model Artifacts", test_model_artifacts),
        ("Pipeline Initialization", test_pipeline_initialization),
        ("Category Mapping", test_category_mapping),
        ("Blur Threshold", test_blur_threshold),
        ("Pipeline Processing", test_pipeline_with_test_image),
        ("Worker Process", test_worker_process),
    ]
    
    results = {}
    for name, test_func in tests:
        print(f"\n[Test] {name}...")
        try:
            result = test_func()
            results[name] = result
        except Exception as e:
            print(f"✗ {name}: EXCEPTION - {e}")
            results[name] = False
    
    # Summary
    print("\n" + "="*60)
    print("Summary")
    print("="*60)
    
    passed = sum(1 for r in results.values() if r is True)
    failed = sum(1 for r in results.values() if r is False)
    skipped = sum(1 for r in results.values() if r is None)
    
    for name, result in results.items():
        status = "✓ PASS" if result is True else ("✗ FAIL" if result is False else "⊘ SKIP")
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed} passed, {failed} failed, {skipped} skipped")
    print("="*60 + "\n")
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
