/**
 * map.js — CityFix
 * Leaflet map module. Works with the PostgreSQL schema:
 *   complaint_id, lattitude (sic), longitude, location,
 *   description, status, category_id, image_url, created_at
 *
 * Exposes: initMap(), renderComplaints(), focusComplaint(), placeSelectedMarker()
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const MAP_DEFAULT_CENTER = [28.6139, 77.209]; // Delhi fallback
const MAP_DEFAULT_ZOOM   = 14;

// Status → accent color (matches server enum)
const STATUS_COLORS = {
  pending:     '#f59e0b',
  underReview: '#a78bfa',
  inProgress:  '#3b82f6',
  resolved:    '#22c55e',
};

// ── Private state ────────────────────────────────────────────────────────────
let _map              = null;
let _markersLayer     = null;
let _selectedMarker   = null;
let _onClickCb        = null;
let _onMarkerClickCb  = null;

// ── Icon factories ───────────────────────────────────────────────────────────
function _complaintIcon(status, active = false) {
  const base  = STATUS_COLORS[status] || '#ff5c3a';
  const color = active ? '#e8ff47' : base;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.628 14 22 14 22S28 23.628 28 14C28 6.268 21.732 0 14 0z"
        fill="${color}" opacity="0.92"/>
      <circle cx="14" cy="14" r="5" fill="#0f0f11" opacity="0.85"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    iconSize:    [28, 36],
    iconAnchor:  [14, 36],
    popupAnchor: [0, -36],
    className:   'cp-marker',
  });
}

function _selectedIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
      <path d="M13 0C5.82 0 0 5.82 0 13c0 8.84 13 21 13 21S26 21.84 26 13C26 5.82 20.18 0 13 0z"
        fill="#7c9dff" opacity="0.95"/>
      <circle cx="13" cy="13" r="4.5" fill="#0f0f11" opacity="0.8"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    iconSize:   [26, 34],
    iconAnchor: [13, 34],
    className:  'cp-selected-marker',
  });
}

// ── Popup builder ────────────────────────────────────────────────────────────
// Server uses `lattitude` (typo) and `complaint_id`
function _buildPopup(c) {
  const statusLabel = {
    pending:     'Pending',
    underReview: 'Under Review',
    inProgress:  'In Progress',
    resolved:    'Resolved',
  }[c.status] || c.status;

  const color = STATUS_COLORS[c.status] || '#888';
  const imgHtml = c.image_url
    ? `<img src="${_esc(c.image_url)}" alt="Complaint image"
         style="width:100%;border-radius:6px;margin-top:6px;object-fit:cover;max-height:110px;">`
    : '';

  return `
    <div style="font-family:'DM Sans',sans-serif;min-width:190px;">
      <div style="font-weight:700;font-size:13px;color:#f1f1f1;margin-bottom:4px">
        ${_esc(c.title || c.description?.slice(0, 50) + '…' || 'Complaint')}
      </div>
      <span style="background:${color}22;color:${color};border:1px solid ${color}55;
                   padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;">
        ${statusLabel}
      </span>
      <div style="color:#aaa;font-size:11px;margin-top:6px">${_esc(c.location || '')}</div>
      ${imgHtml}
      <div style="color:#666;font-size:10px;margin-top:6px">
        #${c.complaint_id} &nbsp;·&nbsp;
        ${Number(c.lattitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}
      </div>
    </div>`;
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates the Leaflet map inside #map.
 * @param {number} lat
 * @param {number} lng
 * @param {Function} onClickCb   - called with {lat, lng} on map click
 * @param {Function} onMarkerCb  - called with complaint object on marker click
 */
function initMap(lat, lng, onClickCb, onMarkerCb) {
  _onClickCb       = onClickCb  || null;
  _onMarkerClickCb = onMarkerCb || null;

  const center = (lat && lng) ? [lat, lng] : MAP_DEFAULT_CENTER;

  _map = L.map('map', {
    center,
    zoom: MAP_DEFAULT_ZOOM,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(_map);

  // User location dot
  if (lat && lng) {
    L.circleMarker([lat, lng], {
      radius: 9,
      color: '#7c9dff',
      fillColor: '#7c9dff',
      fillOpacity: 0.25,
      weight: 2,
    }).addTo(_map).bindPopup('<b style="color:#7c9dff">📍 You are here</b>');
  }

  _markersLayer = L.layerGroup().addTo(_map);

  _map.on('click', function (e) {
    const { lat, lng } = e.latlng;
    placeSelectedMarker(lat, lng);
    if (_onClickCb) _onClickCb({ lat, lng });
  });
}

/**
 * Renders complaint objects as markers.
 * Expects server fields: complaint_id, lattitude, longitude, status, description, image_url, location
 * @param {Array} complaints
 */
function renderComplaints(complaints) {
  if (!_markersLayer) return;
  _markersLayer.clearLayers();

  complaints.forEach((c) => {
    // Server typo: "lattitude"
    const lat = parseFloat(c.lattitude);
    const lng = parseFloat(c.longitude);
    if (isNaN(lat) || isNaN(lng)) return;

    const marker = L.marker([lat, lng], {
      icon: _complaintIcon(c.status, false),
    });

    marker.bindPopup(_buildPopup(c), {
      maxWidth: 240,
      className: 'cp-popup',
    });

    marker.on('click', function () {
      // Highlight this marker
      _markersLayer.eachLayer((l) => {
        if (l._cpId) l.setIcon(_complaintIcon(l._cpStatus, false));
      });
      marker.setIcon(_complaintIcon(c.status, true));
      if (_onMarkerClickCb) _onMarkerClickCb(c);
    });

    marker._cpId     = c.complaint_id;
    marker._cpStatus = c.status;
    _markersLayer.addLayer(marker);
  });
}

/**
 * Flies the map to a complaint and opens its popup.
 * @param {Object} complaint
 */
function focusComplaint(complaint) {
  if (!_map) return;
  const lat = parseFloat(complaint.lattitude);
  const lng = parseFloat(complaint.longitude);
  if (isNaN(lat) || isNaN(lng)) return;

  _map.flyTo([lat, lng], 17, { duration: 0.9 });

  _markersLayer.eachLayer((layer) => {
    if (layer._cpId === complaint.complaint_id) {
      setTimeout(() => layer.openPopup(), 950);
      layer.setIcon(_complaintIcon(complaint.status, true));
    } else {
      layer.setIcon(_complaintIcon(layer._cpStatus, false));
    }
  });
}

/**
 * Places / moves the blue "selected location" pin (for filing a new complaint).
 * @param {number} lat
 * @param {number} lng
 */
function placeSelectedMarker(lat, lng) {
  if (!_map) return;
  if (_selectedMarker) _map.removeLayer(_selectedMarker);
  _selectedMarker = L.marker([lat, lng], { icon: _selectedIcon() }).addTo(_map);
  _selectedMarker
    .bindPopup('<span style="font-size:12px;color:#7c9dff">📍 Selected location</span>')
    .openPopup();
}

/**
 * Returns the currently selected {lat, lng} or null.
 */
function getSelectedLocation() {
  if (!_selectedMarker) return null;
  const ll = _selectedMarker.getLatLng();
  return { lat: ll.lat, lng: ll.lng };
}

/**
 * Clears the selected location marker.
 */
function clearSelectedMarker() {
  if (_selectedMarker && _map) {
    _map.removeLayer(_selectedMarker);
    _selectedMarker = null;
  }
}