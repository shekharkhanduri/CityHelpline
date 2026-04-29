// POST   /auth/register
// POST   /auth/login
// POST   /auth/logout
// POST   /auth/refresh-token
// GET    /auth/profile
// PUT    /auth/update-profile

const express = require('express');
const validateToken = require('../middleware/validateTokenHandler');
const {register,login, current} =require('../controllers/authController');
const router = express.Router()

router.route("/register").post(register);
router.route("/login").post(login);
router.route("/profile").get(validateToken,current);
// router.route("/update-profile").put(validateToken, updateProfile);

module.exports = router;