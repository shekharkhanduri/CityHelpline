const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org/reverse';

const buildLocationText = (address = {}, fallbackDisplayName = '') => {
    const locality =
        address.suburb ||
        address.neighbourhood ||
        address.hamlet ||
        address.village ||
        address.town ||
        address.city_district ||
        '';

    const road = address.road || address.pedestrian || address.footway || '';
    const houseOrLane = address.house_number || address.block || address.quarter || '';
    const city = address.city || address.town || address.village || address.state_district || '';

    const parts = [locality, road, houseOrLane, city].filter(Boolean);
    if (parts.length > 0) {
        return parts.join(', ');
    }

    return fallbackDisplayName || 'Unknown location';
};

const reverseGeocode = async ({ lat, long }) => {
    if (lat == null || long == null) {
        throw new Error('Latitude and longitude are required for reverse geocoding');
    }

    const baseUrl = process.env.NOMINATIM_BASE_URL || DEFAULT_BASE_URL;
    const appName = process.env.GEOCODE_APP_NAME || 'CityHelpline';
    const contactEmail = process.env.GEOCODE_CONTACT_EMAIL;

    const requestUrl = new URL(baseUrl);
    requestUrl.searchParams.set('format', 'jsonv2');
    requestUrl.searchParams.set('lat', String(lat));
    requestUrl.searchParams.set('lon', String(long));
    requestUrl.searchParams.set('addressdetails', '1');

    if (contactEmail) {
        requestUrl.searchParams.set('email', contactEmail);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
        const response = await fetch(requestUrl.toString(), {
            headers: {
                'User-Agent': `${appName}/1.0`,
                Accept: 'application/json',
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Reverse geocoding failed with status ${response.status}`);
        }

        const payload = await response.json();
        return buildLocationText(payload.address, payload.display_name);
    } catch (err) {
        return 'Unknown location';
    } finally {
        clearTimeout(timeout);
    }
};

module.exports = {
    reverseGeocode,
};
