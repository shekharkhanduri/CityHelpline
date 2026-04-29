const requireRole = (allowedRoles = []) => (req, res, next) => {
    const role = req.user?.role;

    if (!role) {
        res.status(401);
        throw new Error('User role is missing in token');
    }

    if (!allowedRoles.includes(role)) {
        res.status(403);
        throw new Error('User is not authorized to perform this action.');
    }

    return next();
};

module.exports = requireRole;
