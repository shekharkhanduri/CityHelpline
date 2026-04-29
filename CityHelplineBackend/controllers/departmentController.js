const asyncHandler = require('express-async-handler');
const {
    createDepartment,
    getDepartments,
    getDepartmentById,
    updateDepartment,
    deleteDepartment,
    getComplaintsByDepartment,
    departmentHasAssignments,
} = require('../services/departmentService');
const { enrichComplaintList } = require('../services/complaintInsightService');

const postDepartment = asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    if (!name || !String(name).trim()) {
        res.status(400);
        throw new Error('Department name is required');
    }

    try {
        const result = await createDepartment({ name: String(name).trim(), description: description ?? null });
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err?.code === '23505') {
            res.status(409);
            throw new Error('Department already exists with this name');
        }
        throw err;
    }
});

const listDepartments = asyncHandler(async (_req, res) => {
    const result = await getDepartments();
    res.status(200).json(result.rows);
});

const fetchDepartmentById = asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
        res.status(400);
        throw new Error('Invalid department id');
    }

    const result = await getDepartmentById({ departmentId });
    if (!result.rows[0]) {
        res.status(404);
        throw new Error('Department not found');
    }

    res.status(200).json(result.rows[0]);
});

const patchDepartment = asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
        res.status(400);
        throw new Error('Invalid department id');
    }

    const payload = {
        departmentId,
        name: req.body.name !== undefined ? String(req.body.name).trim() : undefined,
        description: req.body.description,
        is_active: req.body.is_active,
    };

    if (payload.name !== undefined && !payload.name) {
        res.status(400);
        throw new Error('Department name cannot be empty');
    }

    try {
        const result = await updateDepartment(payload);
        if (!result.rows[0]) {
            const existing = await getDepartmentById({ departmentId });
            if (!existing.rows[0]) {
                res.status(404);
                throw new Error('Department not found');
            }
            res.status(400);
            throw new Error('Provide at least one field to update');
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        if (err?.code === '23505') {
            res.status(409);
            throw new Error('Department already exists with this name');
        }
        throw err;
    }
});

const removeDepartment = asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
        res.status(400);
        throw new Error('Invalid department id');
    }

    const hasAssignments = await departmentHasAssignments({ departmentId });
    if (hasAssignments.rows[0]) {
        res.status(409);
        throw new Error('Department cannot be deleted while assignments exist');
    }

    const result = await deleteDepartment({ departmentId });
    if (!result.rowCount) {
        res.status(404);
        throw new Error('Department not found');
    }

    res.status(200).json({ message: 'Department deleted successfully.' });
});

const listDepartmentComplaints = asyncHandler(async (req, res) => {
    const departmentId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
        res.status(400);
        throw new Error('Invalid department id');
    }

    const existing = await getDepartmentById({ departmentId });
    if (!existing.rows[0]) {
        res.status(404);
        throw new Error('Department not found');
    }

    const result = await getComplaintsByDepartment({
        departmentId,
        status: req.query.status,
        limit,
        offset,
    });

    res.status(200).json(enrichComplaintList(result.rows));
});

module.exports = {
    postDepartment,
    listDepartments,
    fetchDepartmentById,
    patchDepartment,
    removeDepartment,
    listDepartmentComplaints,
};
