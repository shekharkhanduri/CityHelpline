const pool = require('../config/connectDb')
const asyncHandler = require('express-async-handler')
const { enrichComplaint, enrichComplaintList } = require('../services/complaintInsightService');
const { reverseGeocode } = require('../services/reverseGeocodeService');
const { uploadComplaintImageBuffer, deleteComplaintImage } = require('../services/uploadService');
const { validateComplaintImage } = require('../services/imageValidationService');
const { recordComplaintAudit } = require('../services/adminDashboardService');

const COMPLAINT_VALIDATION_MODES = {
    OFF: 'off',
    SHADOW: 'shadow',
    ENFORCE: 'enforce',
};

const normalizeValidationMode = () => {
    const mode = String(process.env.COMPLAINT_IMAGE_VALIDATION_MODE || COMPLAINT_VALIDATION_MODES.OFF).toLowerCase();
    if (Object.values(COMPLAINT_VALIDATION_MODES).includes(mode)) {
        return mode;
    }

    return COMPLAINT_VALIDATION_MODES.OFF;
};

const resolveValidationStatus = ({ validationResult }) => {
    // Direct mapping from validation service result
    return validationResult?.validation_status || 'skipped';
};

const isNoDetectionFailure = (validationResult) => {
    if (!validationResult || validationResult.validation_status !== 'rejected') {
        return false;
    }

    return /no urban issue detected/i.test(String(validationResult.validation_reason || ''));
};


//@path /api/complaints/ POST
//@desc store complaint with evidence image using fallback validation modes
const postComplaint = asyncHandler(async (req, res) => {
    const { lat, long, description, category_id } = req.body;

    if (!req.file) {
        res.status(400);
        throw new Error('Complaint image is required');
    }

    if (!category_id) {
        res.status(400);
        throw new Error('Select a category');
    }

    if (!description || description.length < 20) {
        res.status(400);
        throw new Error('Description cannot be empty or less than 20 characters');
    }

    const complaintUserId = req.user?.id;
    if (!complaintUserId) {
        res.status(401);
        throw new Error('User is not authorized to create complaints');
    }

    const validationMode = normalizeValidationMode();

    // Step 1: Validate image buffer BEFORE Cloudinary upload
    const validationResult = await validateComplaintImage({
        buffer: req.file.buffer,
        categoryId: category_id,
        mode: validationMode,
    });

    // Step 2: In ENFORCE mode, reject hard failures, but treat known no-detection
    // false-negatives as manual-review candidates to avoid blocking valid complaints.
    const softAllowNoDetection =
        validationMode === COMPLAINT_VALIDATION_MODES.ENFORCE &&
        validationResult.verified !== true &&
        isNoDetectionFailure(validationResult);

    const shouldBlockCreation =
        validationMode === COMPLAINT_VALIDATION_MODES.ENFORCE &&
        validationResult.verified !== true &&
        !softAllowNoDetection;

    if (shouldBlockCreation) {
        res.status(422);
        throw new Error(validationResult.validation_reason || 'Complaint image validation failed');
    }

    const normalizedValidationResult = softAllowNoDetection
        ? {
            ...validationResult,
            validation_status: 'pending_validation',
            validation_reason: 'Model could not detect a clear urban issue; complaint queued for manual review',
        }
        : validationResult;

    // Step 3: Upload to Cloudinary (only reached if not rejected)
    let uploadResult;
    try {
        uploadResult = await uploadComplaintImageBuffer(req.file.buffer, {
            folder: 'cityhelpline/complaints/pending',
        });
    } catch (err) {
        console.error(`[Complaint] Cloudinary upload error: ${err}`);
        res.status(500);
        throw new Error('Image upload failed');
    }

    // Step 4: Get location
    const location = await reverseGeocode({ lat, long });

    // Step 5: Insert complaint with validation results
    const result = await pool.query(
        `insert into complaints(
            lattitude,
            longitude,
            location,
            description,
            user_id,
            category_id,
            image_url,
            image_public_id,
            validation_status,
            validation_reason,
            model_version,
            model_confidence,
            validated_at
        ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
        [
            lat,
            long,
            location,
            description,
            complaintUserId,
            category_id,
            uploadResult.secure_url,
            uploadResult.public_id,
            normalizedValidationResult.validation_status,
            normalizedValidationResult.validation_reason || null,
            normalizedValidationResult.model_version || null,
            normalizedValidationResult.model_confidence ?? null,
            ['passed', 'rejected'].includes(normalizedValidationResult.validation_status) ? new Date() : null,
        ]
    );

    const responseCode = validationMode === COMPLAINT_VALIDATION_MODES.ENFORCE ? 201 : 200;
    res.status(responseCode).json(enrichComplaint(result.rows[0]));
});

const getAllComplaints = asyncHandler(async (req,res) =>{
    try{
        const result = await pool.query('select * from complaints order by complaint_id desc');
        res.status(200).json(enrichComplaintList(result.rows));
    }catch(err){
        throw err;
    }
   
});

const getcomplaintsById = asyncHandler(async (req,res)=>{
    const result = await pool.query('select * from complaints where complaint_id=$1 limit 1',[req.params.id]);
    if(!result.rows[0]){
        throw new Error('Complaint not found');
    }
    res.status(200).json(enrichComplaint(result.rows[0]));
});

const updateComplaint = asyncHandler(async (req,res)=>{
    const complaintId = req.params.id;
    const userId = req.user?.id;
    const {description,category_id,lat,long} = req.body;

    if(!userId){
        res.status(401);
        throw new Error('User is not authorized to update the complaint');
    }

    const existingComplaint = await pool.query(
        'select complaint_id, user_id, lattitude, longitude from complaints where complaint_id=$1 limit 1',
        [complaintId]
    );

    if(!existingComplaint.rows[0]){
        res.status(404);
        throw new Error('Complaint not found');
    }

    if(String(existingComplaint.rows[0].user_id) !== String(userId)){
        res.status(403);
        throw new Error('Not permitted to update the complaint');
    }

    const fields = [];
    const values = [];

    if(description !== undefined){
        if(!description || description.length < 20){
            res.status(400);
            throw new Error('Description cannot be empty or less than 20 characters');
        }
        values.push(description);
        fields.push(`description=$${values.length}`);
    }

    if(category_id !== undefined){
        values.push(category_id);
        fields.push(`category_id=$${values.length}`);
    }

    if(lat !== undefined){
        values.push(lat);
        fields.push(`lattitude=$${values.length}`);
    }

    if(long !== undefined){
        values.push(long);
        fields.push(`longitude=$${values.length}`);
    }

    if(fields.length === 0){
        res.status(400);
        throw new Error('Provide at least one field to update');
    }

    if(lat !== undefined || long !== undefined){
        const currentLat = lat !== undefined ? lat : existingComplaint.rows[0].lattitude;
        const currentLong = long !== undefined ? long : existingComplaint.rows[0].longitude;
        const location = await reverseGeocode({ lat: currentLat, long: currentLong });
        values.push(location);
        fields.push(`location=$${values.length}`);
    }

    values.push(complaintId);
    const result = await pool.query(
        `update complaints set ${fields.join(', ')} where complaint_id=$${values.length} returning *`,
        values
    );

    res.status(200).json(enrichComplaint(result.rows[0]));
});



const deleteComplaint= asyncHandler(async (req,res)=>{
    const userId = req.user?.id;
    const complaintId = req.params.id;
    if(!userId){
        res.status(401);
        throw new Error('User is not authorized to delete the complaint');
    }
    const complaintBy = await pool.query("select user_id, image_public_id from complaints where complaint_id=$1 limit 1",[complaintId]);
    if (!complaintBy.rows[0]) {
        res.status(404);
        throw new Error("Complaint not found");
        }
    if(String(userId) !== String(complaintBy.rows[0].user_id)){
        res.status(401);
        throw new Error("Not permitted to delete the complaint")
    }
    const result = await pool.query('delete from complaints where complaint_id=$1',[complaintId]);
    if(!result.rowCount){
        throw new Error("complaint not found");
    }

    if (complaintBy.rows[0].image_public_id) {
        await deleteComplaintImage(complaintBy.rows[0].image_public_id).catch(() => null);
    }

    res.status(200).json({message:"complaint deleted successfully."});
});


const updateStatus = asyncHandler(async (req,res)=>{
    const {status} = req.body;
    const role = req.user?.role;
    const id = req.params.id;
    if(role !== "admin"){
        res.status(403);
        throw new Error("User is not authorized to perform this action.")
    }
    let  result = await pool.query("select complaint_id, status, validation_status from complaints where complaint_id=$1 limit 1", [id]);
    if(!result.rows[0]){
        res.status(404);
        throw new Error("Complaint not found");
    }
    const curren_status = result.rows[0].status;
    const validationStatus = result.rows[0].validation_status;
    const status_order = ['pending', 'underReview', 'inProgress', 'resolved'];
    const currentIndex = status_order.indexOf(curren_status);
    const newIndex = status_order.indexOf(status);

    if(currentIndex === -1 || newIndex === -1){
        res.status(400);
        throw new Error('Invalid complaint status');
    }

    // Same status
    if (newIndex === currentIndex) {
    res.status(400);
    throw new Error("Status is already " + curren_status);
    }

    // Going backwards
    if (newIndex < currentIndex) {
    res.status(400);
    throw new Error("Cannot move status backwards.");
    }

    // Skipping a step
    if (newIndex - currentIndex > 1) {
    res.status(400);
    throw new Error("Cannot skip status steps.");
    }

    if (validationStatus === 'rejected') {
        res.status(400);
        throw new Error('Cannot progress complaint status because image validation was rejected.');
    }

    result = await pool.query("update complaints set status= $1 where complaint_id=$2 returning *",[status,id]);
    if(!result.rows[0]){
        res.status(500);
        throw new Error("Unable to update complaint");
    }
    if(result.rows[0].status !== status){
        throw new Error("unable to update Complain");
    }

    await recordComplaintAudit({
        complaintId: Number(id),
        actorUserId: req.user.id,
        actionType: 'status_change',
        beforeValue: { status: curren_status },
        afterValue: { status },
    });

    res.status(200).json(enrichComplaint(result.rows[0]));
}); 

const assignDepartment = asyncHandler(async (req,res)=>{
    const complaintId = Number(req.params.id);
    const departmentId = Number(req.body.departmentId ?? req.body.department_id);
    const adminId = req.user?.id;
    const role = req.user?.role;

    if(role !== 'admin'){
        res.status(403);
        throw new Error('User is not authorized to perform this action.');
    }

    if(!Number.isInteger(complaintId) || complaintId <= 0){
        res.status(400);
        throw new Error('Invalid complaint id');
    }

    if(!Number.isInteger(departmentId) || departmentId <= 0){
        res.status(400);
        throw new Error('Valid department id is required');
    }

    if(!adminId){
        res.status(401);
        throw new Error('Admin authentication is required');
    }

    const complaint = await pool.query('select complaint_id from complaints where complaint_id=$1 limit 1', [complaintId]);
    if(!complaint.rows[0]){
        res.status(404);
        throw new Error('Complaint not found');
    }

    const department = await pool.query('select department_id from departments where department_id=$1 limit 1', [departmentId]);
    if(!department.rows[0]){
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

    if(existing.rows[0] && Number(existing.rows[0].department_id) === departmentId){
        res.status(409);
        throw new Error('Complaint is already assigned to this department');
    }

    const result = await pool.query("insert into complaint_assignment(complaint_id, admin_id, department_id) values($1,$2,$3) returning *",[complaintId,adminId,departmentId]);
    if(!result.rows[0]){
        throw new Error('unable to assign deparment');
    }

    await recordComplaintAudit({
        complaintId,
        actorUserId: adminId,
        actionType: 'department_assignment',
        beforeValue: existing.rows[0] ? { department_id: existing.rows[0].department_id } : null,
        afterValue: { department_id: departmentId },
    });

    res.status(200).json(result.rows[0]);
})


module.exports = {
    getAllComplaints,
    getcomplaintsById,
    postComplaint,
    updateComplaint,
    deleteComplaint,
    updateStatus,
    assignDepartment,
}