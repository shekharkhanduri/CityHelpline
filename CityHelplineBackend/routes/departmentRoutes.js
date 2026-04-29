const express = require('express');
const validateToken = require('../middleware/validateTokenHandler');
const requireRole = require('../middleware/requireRole');
const {
	postDepartment,
	listDepartments,
	fetchDepartmentById,
	patchDepartment,
	removeDepartment,
	listDepartmentComplaints,
} = require('../controllers/departmentController');

const router = express.Router();

router.use(validateToken);

router.route('/')
	.get(listDepartments)
	.post(requireRole(['admin']), postDepartment);

router.route('/:id')
	.get(fetchDepartmentById)
	.put(requireRole(['admin']), patchDepartment)
	.delete(requireRole(['admin']), removeDepartment);

router.route('/:id/complaints').get(listDepartmentComplaints);

module.exports = router;