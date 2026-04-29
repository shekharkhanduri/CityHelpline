const cloudinary = require('../config/connectCloud');

const uploadComplaintImage = async (filePath, options = {}) => {
	if (!filePath) {
		throw new Error('filePath is required for image upload');
	}

	return cloudinary.uploader.upload(filePath, {
		folder: 'cityhelpline/complaints',
		resource_type: 'image',
		...options,
	});
};

const uploadComplaintImageBuffer = async (fileBuffer, options = {}) => {
	if (!fileBuffer) {
		throw new Error('fileBuffer is required for image upload');
	}

	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				folder: 'cityhelpline/complaints',
				resource_type: 'image',
				...options,
			},
			(err, result) => {
				if (err) {
					return reject(err);
				}

				return resolve(result);
			}
		);

		uploadStream.end(fileBuffer);
	});
};

const deleteComplaintImage = async (publicId) => {
	if (!publicId) {
		throw new Error('publicId is required to delete an image');
	}

	return cloudinary.uploader.destroy(publicId, {
		resource_type: 'image',
	});
};

module.exports = {
	uploadComplaintImage,
	uploadComplaintImageBuffer,
	deleteComplaintImage,
};
