const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');

/**
 * Image Validation Service: Node Bridge to Python Worker
 *
 * Manages a persistent Python worker process that validates images through
 * the ImageVerificationPipeline. Handles:
 * - Worker subprocess lifecycle (start once, reuse for all requests)
 * - Request/response JSON serialization
 * - Cloudinary URL downloads to temp files
 * - Timeout and error handling
 * - Database schema mapping
 */

// Configuration
const PYTHON_WORKER_CWD = path.join(__dirname, '..', 'image-verification-backend-package');
const PYTHON_WORKER_PATH = path.join(__dirname, '..', 'image-verification-backend-package', 'worker.py');
const DEFAULT_VENV_PYTHON = path.join(PYTHON_WORKER_CWD, '.venv', 'bin', 'python3');
const PYTHON_EXECUTABLE = process.env.PYTHON_WORKER_EXECUTABLE
    || (fs.existsSync(DEFAULT_VENV_PYTHON) ? DEFAULT_VENV_PYTHON : 'python3');
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds for validation
const TEMP_IMAGE_DIR = path.join(os.tmpdir(), 'cityhelpline-validation');
const MODEL_VERSION = 'urban_issues_yolo_v1';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_IMAGE_DIR)) {
    fs.mkdirSync(TEMP_IMAGE_DIR, { recursive: true });
}

let workerProcess = null;
let workerReady = false;
let requestQueue = [];
let currentRequestId = 0;

const findRequestIndexById = (requestId) => requestQueue.findIndex((r) => r.id === requestId);

/**
 * Start the Python worker process (called once at backend startup)
 */
const startWorker = () => {
    if (workerProcess) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        try {
            workerProcess = spawn(PYTHON_EXECUTABLE, [PYTHON_WORKER_PATH], {
                cwd: PYTHON_WORKER_CWD,
                stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
            });

            let stderrOutput = '';

            // Capture stderr (logging)
            workerProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                stderrOutput += msg;
                console.log(`[Python Worker] ${msg}`);
            });

            // Handle worker exit
            workerProcess.on('exit', (code, signal) => {
                console.error(`[ImageValidation] Worker exited with code ${code}, signal ${signal}`);
                workerProcess = null;
                workerReady = false;
                // Reject any pending requests
                requestQueue.forEach(req => {
                    req.reject(new Error(`Worker process exited: code ${code}, signal ${signal}`));
                });
                requestQueue = [];
            });

            // Handle worker errors
            workerProcess.on('error', (err) => {
                console.error(`[ImageValidation] Worker error: ${err}`);
                reject(err);
            });

            // Setup stdout line reader for responses
            const readline = require('readline');
            const rl = readline.createInterface({
                input: workerProcess.stdout,
                crlfDelay: Infinity
            });

            rl.on('line', (line) => {
                // Skip empty lines and non-JSON responses
                if (!line.trim()) {
                    return;
                }
                
                if (!line.trim().startsWith('{')) {
                    // Non-JSON line from Python logging, skip silently
                    return;
                }
                
                try {
                    const response = JSON.parse(line);
                    const requestId = response._request_id;
                    if (requestId === undefined || requestId === null) {
                        // Ignore JSON lines that are not worker protocol responses.
                        return;
                    }

                    const idx = findRequestIndexById(requestId);
                    if (idx < 0) {
                        return;
                    }

                    const request = requestQueue.splice(idx, 1)[0];
                    request.resolve(response);
                } catch (err) {
                    console.error(`[ImageValidation] Failed to parse worker response: ${line}`, err);
                }
            });

            rl.on('close', () => {
                console.log('[ImageValidation] Worker stdout closed');
            });

            workerReady = true;
            resolve();

        } catch (err) {
            console.error(`[ImageValidation] Failed to start worker: ${err}`);
            reject(err);
        }
    });
};

/**
 * Download an image from a Cloudinary URL to a temp file
 */
const downloadImageToTemp = (imageUrl) => {
    return new Promise((resolve, reject) => {
        try {
            const tempFilePath = path.join(TEMP_IMAGE_DIR, `image_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
            const file = fs.createWriteStream(tempFilePath);

            const protocol = imageUrl.startsWith('https') ? https : http;
            
            const request = protocol.get(imageUrl, { timeout: 10000 }, (response) => {
                if (response.statusCode !== 200) {
                    file.destroy();
                    fs.unlinkSync(tempFilePath);
                    return reject(new Error(`Failed to download image: HTTP ${response.statusCode}`));
                }

                response.pipe(file);
            });

            request.on('error', (err) => {
                file.destroy();
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (e) {}
                reject(err);
            });

            file.on('error', (err) => {
                fs.unlink(tempFilePath, () => {});
                reject(err);
            });

            file.on('finish', () => {
                file.close();
                resolve(tempFilePath);
            });

            request.on('timeout', () => {
                request.destroy();
                file.destroy();
                fs.unlink(tempFilePath, () => {});
                reject(new Error('Image download timeout'));
            });

        } catch (err) {
            reject(err);
        }
    });
};

/**
 * Send a validation request to the worker and wait for response
 */
const sendValidationRequest = (imagePath, categoryId) => {
    return new Promise((resolve, reject) => {
        if (!workerProcess || !workerReady) {
            return reject(new Error('Worker not initialized'));
        }

        const requestId = currentRequestId++;

        const request = {
            _request_id: requestId,
            command: 'validate',
            image_path: imagePath,
            complaint_category_id: categoryId || null,
        };

        const timeoutHandle = setTimeout(() => {
            const idx = findRequestIndexById(requestId);
            if (idx >= 0) {
                const req = requestQueue.splice(idx, 1)[0];
                req.reject(new Error('Validation request timeout'));
            }
        }, REQUEST_TIMEOUT_MS);

        requestQueue.push({
            id: requestId,
            resolve: (response) => {
                clearTimeout(timeoutHandle);
                resolve(response);
            },
            reject: (err) => {
                clearTimeout(timeoutHandle);
                reject(err);
            },
        });

        try {
            workerProcess.stdin.write(JSON.stringify(request) + '\n');
        } catch (err) {
            requestQueue.pop();
            clearTimeout(timeoutHandle);
            reject(err);
        }
    });
};

/**
 * Clean up temp image files
 */
const cleanupTempImage = (filePath) => {
    if (!filePath || !filePath.startsWith(TEMP_IMAGE_DIR)) {
        return;
    }
    
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.warn(`[ImageValidation] Failed to delete temp file ${filePath}: ${err}`);
        }
    });
};

/**
 * Map Python worker response to complaint database schema
 */
const mapWorkerResponseToDbSchema = (workerResponse) => {
    const status = workerResponse.status;
    const verified = workerResponse.verified === true;

    let validation_status = 'pending_validation';
    let validation_reason = null;
    let model_confidence = null;

    if (status === 'success') {
        validation_status = 'passed';
        validation_reason = `Verified: ${workerResponse.category} (confidence: ${(workerResponse.confidence * 100).toFixed(1)}%)`;
        model_confidence = workerResponse.confidence;
    } else if (status === 'failure') {
        validation_status = 'rejected';
        validation_reason = workerResponse.reason || 'Image validation failed';
        model_confidence = workerResponse.confidence || null;
    } else if (status === 'error') {
        validation_status = 'pending_validation';
        validation_reason = `Validation error: ${workerResponse.error}`;
        model_confidence = null;
    }

    return {
        verified,
        validation_status,
        validation_reason,
        model_version: workerResponse.model_version || MODEL_VERSION,
        model_confidence,
        status,
        error: workerResponse.error || null,
    };
};

/**
 * Save a buffer to a temp file
 */
const saveBufferToTemp = (buffer) => {
    return new Promise((resolve, reject) => {
        try {
            const tempFilePath = path.join(TEMP_IMAGE_DIR, `image_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
            fs.writeFile(tempFilePath, buffer, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(tempFilePath);
                }
            });
        } catch (err) {
            reject(err);
        }
    });
};

/**
 * Internal validation logic shared by buffer and URL validation
 */
const performValidation = async (tempImagePath, categoryId, mode, startTime) => {
    // Ensure worker is running
    try {
        await startWorker();
    } catch (err) {
        console.error(`[ImageValidation] Failed to start worker: ${err}`);
        
        if (mode === 'enforce') {
            throw new Error('Image validation service is unavailable');
        }
        
        return {
            verified: false,
            validation_status: 'pending_validation',
            validation_reason: 'Validation service unavailable',
            model_version: MODEL_VERSION,
            model_confidence: null,
            processingTimeMs: Date.now() - startTime,
        };
    }

    try {
        // Send validation request to worker
        const workerResponse = await sendValidationRequest(tempImagePath, categoryId);

        // Map worker response to database schema
        const result = mapWorkerResponseToDbSchema(workerResponse);
        result.processingTimeMs = Date.now() - startTime;

        return result;

    } catch (err) {
        console.error(`[ImageValidation] Validation error: ${err}`);

        const processingTimeMs = Date.now() - startTime;

        // System error; behavior depends on mode
        if (mode === 'enforce') {
            throw new Error(`Image validation failed: ${err.message}`);
        }

        // SHADOW mode: log and continue
        return {
            verified: false,
            validation_status: 'pending_validation',
            validation_reason: `Validation error: ${err.message}`,
            model_version: MODEL_VERSION,
            model_confidence: null,
            processingTimeMs,
        };
    }
};

/**
 * Validate an image buffer before Cloudinary upload
 */
const validateImageBuffer = async ({ buffer, categoryId, mode = 'off' }) => {
    const startTime = Date.now();

    // Mode OFF: Skip validation entirely
    if (mode === 'off') {
        return {
            verified: false,
            validation_status: 'skipped',
            validation_reason: 'Validation disabled (mode=off)',
            model_version: MODEL_VERSION,
            model_confidence: null,
            processingTimeMs: 0,
        };
    }

    let tempImagePath = null;

    try {
        // Write buffer to temp file
        tempImagePath = await saveBufferToTemp(buffer);

        // Perform validation
        return await performValidation(tempImagePath, categoryId, mode, startTime);

    } finally {
        // Clean up temp image
        if (tempImagePath) {
            cleanupTempImage(tempImagePath);
        }
    }
};

/**
 * Validate an image URL (post-Cloudinary upload)
 */
const validateImageUrl = async ({ imageUrl, categoryId, mode = 'off' }) => {
    const startTime = Date.now();

    // Mode OFF: Skip validation entirely
    if (mode === 'off') {
        return {
            verified: false,
            validation_status: 'skipped',
            validation_reason: 'Validation disabled (mode=off)',
            model_version: MODEL_VERSION,
            model_confidence: null,
            processingTimeMs: 0,
        };
    }

    let tempImagePath = null;

    try {
        // Download image from Cloudinary to temp file
        tempImagePath = await downloadImageToTemp(imageUrl);

        // Perform validation
        return await performValidation(tempImagePath, categoryId, mode, startTime);

    } finally {
        // Clean up temp image
        if (tempImagePath) {
            cleanupTempImage(tempImagePath);
        }
    }
};

/**
 * Main validation entry point called from complaintController
 * Supports both buffer (pre-upload) and URL (post-upload) validation
 */
const validateComplaintImage = async ({ buffer, imageUrl, categoryId, mode = 'off' }) => {
    if (buffer) {
        return validateImageBuffer({ buffer, categoryId, mode });
    } else if (imageUrl) {
        return validateImageUrl({ imageUrl, categoryId, mode });
    } else {
        return {
            verified: false,
            validation_status: 'blocked',
            validation_reason: 'No image provided for validation',
            model_version: MODEL_VERSION,
            model_confidence: null,
            processingTimeMs: 0,
        };
    }
};

/**
 * Graceful worker shutdown
 */
const shutdownWorker = () => {
    return new Promise((resolve) => {
        if (!workerProcess) {
            return resolve();
        }

        console.log('[ImageValidation] Shutting down worker...');
        
        workerProcess.stdin.end();
        
        const timeout = setTimeout(() => {
            console.warn('[ImageValidation] Worker shutdown timeout, forcing kill');
            workerProcess.kill('SIGKILL');
            resolve();
        }, 5000);

        workerProcess.on('exit', () => {
            clearTimeout(timeout);
            console.log('[ImageValidation] Worker shut down');
            resolve();
        });
    });
};

module.exports = {
    validateComplaintImage,
    validateImageBuffer,
    validateImageUrl,
    startWorker,
    shutdownWorker,
};