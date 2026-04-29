const pool = require('../config/connectDb');

const createDepartment = async ({ name, description = null }) => {
    return pool.query(
        'insert into departments(name, description) values($1, $2) returning *',
        [name, description]
    );
};

const getDepartments = async () => {
    return pool.query('select * from departments order by department_id asc');
};

const getDepartmentById = async ({ departmentId }) => {
    return pool.query('select * from departments where department_id=$1 limit 1', [departmentId]);
};

const updateDepartment = async ({ departmentId, name, description, is_active }) => {
    const fields = [];
    const values = [];

    if (name !== undefined) {
        values.push(name);
        fields.push(`name=$${values.length}`);
    }

    if (description !== undefined) {
        values.push(description);
        fields.push(`description=$${values.length}`);
    }

    if (is_active !== undefined) {
        values.push(is_active);
        fields.push(`is_active=$${values.length}`);
    }

    if (!fields.length) {
        return { rows: [] };
    }

    values.push(departmentId);

    return pool.query(
        `update departments set ${fields.join(', ')}, updated_at=current_timestamp where department_id=$${values.length} returning *`,
        values
    );
};

const deleteDepartment = async ({ departmentId }) => {
    return pool.query('delete from departments where department_id=$1', [departmentId]);
};

const getComplaintsByDepartment = async ({ departmentId, status, limit = 50, offset = 0 }) => {
    const values = [departmentId];
    const where = ['ca.department_id=$1'];

    if (status) {
        values.push(status);
        where.push(`c.status=$${values.length}`);
    }

    values.push(limit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    return pool.query(
        `select c.*, ca.department_id, ca.admin_id, ca.created_at as assigned_at
         from complaint_assignment ca
         join complaints c on c.complaint_id = ca.complaint_id
         where ${where.join(' and ')}
         order by ca.created_at desc
         limit $${limitIdx} offset $${offsetIdx}`,
        values
    );
};

const departmentHasAssignments = async ({ departmentId }) => {
    return pool.query('select complaint_id from complaint_assignment where department_id=$1 limit 1', [departmentId]);
};

module.exports = {
    createDepartment,
    getDepartments,
    getDepartmentById,
    updateDepartment,
    deleteDepartment,
    getComplaintsByDepartment,
    departmentHasAssignments,
};
