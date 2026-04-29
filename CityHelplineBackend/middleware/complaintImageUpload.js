const multer = require('multer');

const MAX_IMAGE_SIZE_MB = Number(process.env.MAX_COMPLAINT_IMAGE_MB || 8);

const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error('Only JPEG, PNG, and WEBP images are allowed'));
    }

    return cb(null, true);
};

const uploadComplaintImageMiddleware = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: {
        fileSize: MAX_IMAGE_SIZE_MB * 1024 * 1024,
    },
}).single('image');

const parseComplaintImageUpload = (req, res, next) => {
    uploadComplaintImageMiddleware(req, res, (err) => {
        if (!err) {
            return next();
        }

        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            res.status(413);
            return next(new Error(`Image must be smaller than ${MAX_IMAGE_SIZE_MB}MB`));
        }

        res.status(400);
        return next(new Error(err.message || 'Invalid complaint image payload'));
    });
};

module.exports = {
    parseComplaintImageUpload,
};
