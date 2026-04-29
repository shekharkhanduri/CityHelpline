const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");

const validateToken = asyncHandler(async (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;

    if(authHeader && authHeader.startsWith("Bearer ")){
        token = authHeader.split(" ")[1];
        
        if(!token){
            res.status(401);
            throw new Error("User is not authorized or token is missing");
        }

        try {
            req.user = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            return next();
        } catch (err) {
            res.status(401);
            throw new Error("User is not authenticated");
        }
    } else {
        res.status(401);
        throw new Error("User is not authorized or token is missing");
    }
});

module.exports = validateToken;