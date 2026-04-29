const PRIORITY_RULES = {
    high: ['road damage', 'pothole', 'electrical', 'fire', 'accident', 'water leakage', 'flood', 'safety'],
    medium: ['garbage', 'street light', 'drainage', 'sewage', 'broken', 'damage'],
};

const normalizeText = (value) => String(value || '').toLowerCase();

const calculatePriority = ({ title, description, category_id, severityScore = 0, nearbyReports = 0 }) => {
    const text = `${normalizeText(title)} ${normalizeText(description)}`;

    let score = 0;

    if (Number.isFinite(Number(category_id))) {
        score += Number(category_id) === 1 ? 1 : 0;
    }

    for (const keyword of PRIORITY_RULES.high) {
        if (text.includes(keyword)) {
            score += 3;
        }
    }

    for (const keyword of PRIORITY_RULES.medium) {
        if (text.includes(keyword)) {
            score += 2;
        }
    }

    if (description && description.length > 120) {
        score += 1;
    }

    score += Number(severityScore) || 0;
    score += Number(nearbyReports) >= 3 ? 2 : 0;
    score += Number(nearbyReports) >= 8 ? 2 : 0;

    if (score >= 6) {
        return 'high';
    }

    if (score >= 3) {
        return 'medium';
    }

    return 'low';
};

const enrichComplaint = (complaint) => ({
    ...complaint,
    priority: calculatePriority(complaint),
});

const enrichComplaintList = (complaints) => complaints.map(enrichComplaint);

module.exports = {
    calculatePriority,
    enrichComplaint,
    enrichComplaintList,
};
