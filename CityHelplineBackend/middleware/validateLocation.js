//validate city
const pool = require('../config/connectDb');

const validateLocation = async (req,res,next)=>{
    const {lat,long} = req.body;
    if(lat == null || long == null){
        res.status(400)
        throw new Error('Latitude and longitude are required');
    }
    try{
        const result = await pool.query("select ST_Covers(geom, ST_SetSRID(ST_MakePoint($1,$2), 4326)) as is_in_dehradun from city_boundary where city_name= 'Dehradun'",[long,lat]);
        if(result.rows[0].is_in_dehradun){
            next();
        }else{
            res.status(401)
            throw new Error('User is outside the city');
        }
    }catch(err){

        throw err;
    }
}

module.exports = validateLocation