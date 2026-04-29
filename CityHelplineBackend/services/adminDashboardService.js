const pool = require('../config/connectDb');

const getStatusCounts = async () => {
    return pool.query(
        `select
            count(*)::int as total,
            count(*) filter (where status='pending')::int as pending,
            count(*) filter (where status='underReview')::int as underreview,
            count(*) filter (where status='inProgress')::int as inprogress,
            count(*) filter (where status='resolved')::int as resolved,
            count(*) filter (where validation_status='rejected')::int as validationfailed
         from complaints`
    );
};

const getDepartmentWorkload = async () => {
    return pool.query(
        `select d.department_id, d.name,
                count(ca.complaint_id)::int as total_assigned,
                count(*) filter (where c.status='pending')::int as pending_count,
                count(*) filter (where c.status='underReview')::int as under_review_count,
                count(*) filter (where c.status='inProgress')::int as in_progress_count,
                count(*) filter (where c.status='resolved')::int as resolved_count
         from departments d
         left join complaint_assignment ca on ca.department_id = d.department_id
         left join complaints c on c.complaint_id = ca.complaint_id
         group by d.department_id, d.name
         order by d.name asc`
    );
};

const getRecentActivity = async ({ limit = 20 }) => {
    return pool.query(
        `select audit_id, complaint_id, actor_user_id, action_type, before_value, after_value, created_at
         from complaint_audit_log
         order by created_at desc
         limit $1`,
        [limit]
    );
};

const getAdminComplaints = async ({ status, departmentId, limit = 50, offset = 0 }) => {
    const values = [];
    const where = [];

    if (status) {
        values.push(status);
        where.push(`c.status=$${values.length}`);
    }

    if (departmentId) {
        values.push(departmentId);
        where.push(`ca.department_id=$${values.length}`);
    }

    values.push(limit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const whereClause = where.length ? `where ${where.join(' and ')}` : '';

    return pool.query(
        `select c.*, ca.department_id, ca.admin_id, ca.created_at as assigned_at
         from complaints c
         left join lateral (
            select complaint_id, department_id, admin_id, created_at
            from complaint_assignment
            where complaint_id = c.complaint_id
            order by created_at desc
            limit 1
         ) ca on true
         ${whereClause}
         order by c.complaint_id desc
         limit $${limitIdx} offset $${offsetIdx}`,
        values
    );
};

const recordComplaintAudit = async ({ complaintId, actorUserId, actionType, beforeValue, afterValue }) => {
    try {
        await pool.query(
            `insert into complaint_audit_log(complaint_id, actor_user_id, action_type, before_value, after_value)
             values($1,$2,$3,$4,$5)`,
            [complaintId, actorUserId, actionType, beforeValue || null, afterValue || null]
        );
    } catch (err) {
        // Non-fatal until audit table is applied everywhere.
        if (err?.code !== '42P01') {
            throw err;
        }
    }
};

module.exports = {
    getStatusCounts,
    getDepartmentWorkload,
    getRecentActivity,
    getAdminComplaints,
    recordComplaintAudit,
};
