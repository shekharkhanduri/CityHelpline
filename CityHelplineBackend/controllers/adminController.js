const asyncHandler = require('express-async-handler');
const pool = require('../config/connectDb');
const { enrichComplaintList, enrichComplaint } = require('../services/complaintInsightService');
const {
    getStatusCounts,
    getDepartmentWorkload,
    getRecentActivity,
    getAdminComplaints,
    recordComplaintAudit,
} = require('../services/adminDashboardService');
const {
    postDepartment,
    listDepartments,
    fetchDepartmentById,
    patchDepartment,
    removeDepartment,
    listDepartmentComplaints,
} = require('./departmentController');

const VALID_STATUS_ORDER = ['pending', 'underReview', 'inProgress', 'resolved'];

const getAdminDashboard = asyncHandler(async (_req, res) => {
    const totals = await getStatusCounts();
    const departmentWorkload = await getDepartmentWorkload();
    const recentActivity = await getRecentActivity({ limit: 20 });

    res.status(200).json({
        totals: totals.rows[0] || {
            total: 0,
            pending: 0,
            underreview: 0,
            inprogress: 0,
            resolved: 0,
            validationfailed: 0,
        },
        departmentWorkload: departmentWorkload.rows,
        recentActivity: recentActivity.rows,
    });
});

const getAdminComplaintsList = asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;

    if (departmentId !== undefined && (!Number.isInteger(departmentId) || departmentId <= 0)) {
        res.status(400);
        throw new Error('Invalid department_id filter');
    }

    const result = await getAdminComplaints({
        status: req.query.status,
        departmentId,
        limit,
        offset,
    });

    res.status(200).json(enrichComplaintList(result.rows));
});

const updateAdminComplaintStatus = asyncHandler(async (req, res) => {
    const complaintId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(complaintId) || complaintId <= 0) {
        res.status(400);
        throw new Error('Invalid complaint id');
    }

    if (!VALID_STATUS_ORDER.includes(status)) {
        res.status(400);
        throw new Error('Invalid complaint status');
    }

    let result = await pool.query(
        'select complaint_id, status, validation_status from complaints where complaint_id=$1 limit 1',
        [complaintId]
    );

    if (!result.rows[0]) {
        res.status(404);
        throw new Error('Complaint not found');
    }

    const currentStatus = result.rows[0].status;
    const validationStatus = result.rows[0].validation_status;
    const currentIndex = VALID_STATUS_ORDER.indexOf(currentStatus);
    const newIndex = VALID_STATUS_ORDER.indexOf(status);

    if (newIndex === currentIndex) {
        res.status(400);
        throw new Error(`Status is already ${currentStatus}`);
    }

    if (newIndex < currentIndex) {
        res.status(400);
        throw new Error('Cannot move status backwards.');
    }

    if (newIndex - currentIndex > 1) {
        res.status(400);
        throw new Error('Cannot skip status steps.');
    }

    if (validationStatus === 'rejected') {
        res.status(400);
        throw new Error('Cannot progress complaint status because image validation was rejected.');
    }

    result = await pool.query(
        'update complaints set status=$1 where complaint_id=$2 returning *',
        [status, complaintId]
    );

    await recordComplaintAudit({
        complaintId,
        actorUserId: req.user.id,
        actionType: 'status_change',
        beforeValue: { status: currentStatus },
        afterValue: { status },
    });

    res.status(200).json(enrichComplaint(result.rows[0]));
});

const assignAdminComplaintDepartment = asyncHandler(async (req, res) => {
    const complaintId = Number(req.params.id);
    const departmentId = Number(req.body.department_id ?? req.body.departmentId);

    if (!Number.isInteger(complaintId) || complaintId <= 0) {
        res.status(400);
        throw new Error('Invalid complaint id');
    }

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
        res.status(400);
        throw new Error('Valid department id is required');
    }

    const complaint = await pool.query('select complaint_id from complaints where complaint_id=$1 limit 1', [complaintId]);
    if (!complaint.rows[0]) {
        res.status(404);
        throw new Error('Complaint not found');
    }

    const department = await pool.query('select department_id from departments where department_id=$1 limit 1', [departmentId]);
    if (!department.rows[0]) {
        res.status(404);
        throw new Error('Department not found');
    }

    const existing = await pool.query(
        `select department_id from complaint_assignment
         where complaint_id=$1
         order by created_at desc nulls last
         limit 1`,
        [complaintId]
    );

    if (existing.rows[0] && Number(existing.rows[0].department_id) === departmentId) {
        res.status(409);
        throw new Error('Complaint is already assigned to this department');
    }

    const inserted = await pool.query(
        'insert into complaint_assignment(complaint_id, admin_id, department_id) values($1,$2,$3) returning *',
        [complaintId, req.user.id, departmentId]
    );

    await recordComplaintAudit({
        complaintId,
        actorUserId: req.user.id,
        actionType: 'department_assignment',
        beforeValue: existing.rows[0] ? { department_id: existing.rows[0].department_id } : null,
        afterValue: { department_id: departmentId },
    });

    res.status(200).json(inserted.rows[0]);
});

module.exports = {
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
};
