// Error handler middleware
const errorHandler = (err, req, res, next) => {
  // Get status code from response if it was set, otherwise default to 500
  // When asyncHandler throws an error after res.status() is called, 
  // the status code is preserved in res.statusCode
  let statusCode = res.statusCode;
  
  if (!statusCode || statusCode === 200) {
    statusCode = err.statusCode || err.status || 500;
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "An error occurred",
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;

