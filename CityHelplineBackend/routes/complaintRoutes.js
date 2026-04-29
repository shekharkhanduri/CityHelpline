// // POST   /complaints
// // GET    /complaints
// // GET    /complaints/:id
// // PUT    /complaints/:id
// // DELETE /complaints/:id
// // PATCH  /complaints/:id/status
// // PATCH  /complaints/:id/assign
// // GET    /complaints/user/:userId
// // GET    /complaints/status/:sgettatus
const express = require('express')
const router = express.Router();
const {postComplaint,
    getAllComplaints,
    getcomplaintsById,
    updateComplaint,
    deleteComplaint,
    updateStatus,
    assignDepartment} = require('../controllers/complaintController');
const validateLocation =require('../middleware/validateLocation');
const validateToken = require('../middleware/validateTokenHandler');
const { parseComplaintImageUpload } = require('../middleware/complaintImageUpload');

router.route('/').post(validateToken, parseComplaintImageUpload, validateLocation, postComplaint).get(getAllComplaints);
router.route('/:id').get(getcomplaintsById).put(validateToken, updateComplaint).delete(validateToken, deleteComplaint);
router.route('/:id/status').patch(validateToken, updateStatus);
router.route('/:id/assign').patch(validateToken, assignDepartment);

module.exports = router