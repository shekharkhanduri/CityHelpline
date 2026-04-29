const express = require('express');
const validateToken = require('../middleware/validateTokenHandler');
const requireRole = require('../middleware/requireRole');
const {
	getAdminDashboard,
	getAdminComplaintsList,
	updateAdminComplaintStatus,
	assignAdminComplaintDepartment,
	postDepartment,
	listDepartments,
	fetchDepartmentById,
	patchDepartment,
	removeDepartment,
	listDepartmentComplaints,
} = require('../controllers/adminController');

const router = express.Router()

router.use(validateToken);
router.use(requireRole(['admin']));

router.route('/dashboard').get(getAdminDashboard);
router.route('/complaints').get(getAdminComplaintsList);
router.route('/complaints/:id/status').patch(updateAdminComplaintStatus);
router.route('/complaints/:id/assign').patch(assignAdminComplaintDepartment);

router.route('/departments')
	.get(listDepartments)
	.post(postDepartment);

router.route('/departments/:id')
	.get(fetchDepartmentById)
	.put(patchDepartment)
	.delete(removeDepartment);

router.route('/departments/:id/complaints').get(listDepartmentComplaints);

module.exports = router;