const pool = require('../config/connectDb');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
//@method post /api/register
//@desc register the user
const register = asyncHandler(async (req, res)=>{
    const {name,password,email} = req.body;
    if(!name || !password || !email){
        res.status(400);
        throw new Error('All fields are mandatory');
    }
    const hashPass = await bcrypt.hash(password,10);
    const existingUser = await pool.query('select user_id from users where email=$1 limit 1',[email]);
    if(existingUser.rows[0]){
        res.status(409);
        throw new Error("User already exists with this email");
    }
    try{
        const result = await pool.query(
            "insert into users(name,email,password) values($1,$2,$3) returning user_id as id,name,email,role,created_at",
            [name,email,hashPass]
        );
        const user = result.rows[0];
        const token = jwt.sign({id:user.id, role:user.role},
            process.env.ACCESS_TOKEN_SECRET,
            {expiresIn: '3d'}
        );
        res.status(201).json({user,token});
    }
    catch(err){
        throw err;
    }
});

//@post /api/auth/login
//@desc login user and issue token
const login = asyncHandler(async (req,res)=>{
    const {email, password} = req.body;
    if(!email || !password){
        res.status(400);
        throw new Error("Email and password are required");
    }
    try{
       const result = await pool.query('select user_id as id,name,email,password,role,created_at from users where email= $1 limit 1',[email]);
       const user = result.rows[0];
       if(!user){
        res.status(401);
        throw new Error("User not found");
       }
       const hashPass = user.password;
       const isValid = await bcrypt.compare(password,hashPass);
       if(!isValid){
            res.status(401);
            throw new Error("Invalid password");
       }
    const { password: _, ...safeUser } = user;
    const token = jwt.sign({id:user.id, role:user.role},
            process.env.ACCESS_TOKEN_SECRET,
            {expiresIn: '3d'}
        );
       res.status(200).json({user: safeUser, token});
    }
    catch(err){
        throw err;
    }
});

const current = asyncHandler(async (req,res) =>{
    try{
        const result = await pool.query("select user_id as id,name,role,email,created_at from users where user_id=$1",[req.user.id]);
        res.status(200).json(result.rows[0]);
    }
    catch(err){
        throw err;
    }
    
});



module.exports ={register, login, current};

