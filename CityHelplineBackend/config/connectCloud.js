const cloudinary = require('cloudinary').v2;

const cloudName = process.env.CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.API_KEY || process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.API_SECRET || process.env.CLOUDINARY_API_SECRET;

const missingConfig = [];
if (!cloudName) missingConfig.push('CLOUD_NAME');
if (!apiKey) missingConfig.push('API_KEY');
if (!apiSecret) missingConfig.push('API_SECRET');

if (missingConfig.length) {
    throw new Error(`Cloudinary configuration missing: ${missingConfig.join(', ')}`);
}

cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
});

module.exports = cloudinary;