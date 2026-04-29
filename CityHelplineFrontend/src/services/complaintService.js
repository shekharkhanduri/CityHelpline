// Functions in this file:
// - fetchComplaints: Fetches all complaints
// - fetchComplaintById: Retrieves a complaint by ID
// - fileComplaint: Submits a new complaint with image
// - updateComplaintStatus: Updates complaint status
// - deleteComplaint: Deletes a complaint by ID

import { API_BASE } from "../js/config.js";
import { buildHeaders, getToken } from "../utils/auth.js";


// GET /api/complaints                   (GET)
// GET /api/complaints/id                (GET BY ID)
// POST /api/complaints                  (FILE)
// PATCH /api/complaints/complaint id    (UPDATE STATUS)
// DELETE /api/complaints/complaint id   (DELETE)



// GET COMPLAINT 

export async function fetchComplaints() {
  const res = await fetch(`${API_BASE}/api/complaints`);

  if (!res.ok) {
    throw new Error(`Failed to fetch complaints: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.complaints || [];
}



// GET COMPLAINT BY ID

export async function fetchComplaintById(id) {
  const res = await fetch(`${API_BASE}/api/complaints/${id}`);
  if (!res.ok) throw new Error(`Complaint not found: ${res.status}`);
  return await res.json();
}



// FILE COMPLAINT

export async function fileComplaint(complaintData, imageFile) {
  if (!imageFile) throw new Error("An evidence photo is required.");
  const token = getToken();
  const formData = new FormData();
  Object.entries(complaintData).forEach(([key, value]) => {
    formData.append(key, value);
  });

  formData.append("image", imageFile, imageFile.name);
  const res = await fetch(`${API_BASE}/api/complaints`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "login.html";
    return null;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}



// UPDATE STATUS

export async function updateComplaintStatus(complaintId, newStatus) {
  const res = await fetch(`${API_BASE}/api/complaints/${complaintId}/status`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify({ status: newStatus }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}



// DELETE

export async function deleteComplaint(complaintId) {
  const res = await fetch(`${API_BASE}/api/complaints/${complaintId}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}




/**
 * Example response shape:

```json
{
  "complaint_id": 101,
  "user_id": 12,
  "category_id": 1,
  "lattitude": "30.3165",
  "longitude": "78.0322",
  "location": "...",
  "description": "...",
  "image_url": "https://...",
  "image_public_id": "cityhelpline/...",
  "status": "pending",
  "validation_status": "passed",
  "validation_reason": "...",
  "model_version": "...",
  "model_confidence": "0.8543",
  "validated_at": "...",
  "created_at": "...",
  "priority": "high"
}

**/