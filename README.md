# CityHelpline

CityHelpline is a civic issue reporting platform with a Node.js/Express backend, a static HTML/CSS/JavaScript frontend, and a Python-based image verification worker used for complaint intake.

## Project Structure

- `CityHelplineBackend/` - API server, database access, authentication, complaint workflows, and image validation integration
- `CityHelplineFrontend/` - static frontend pages, styles, and browser-side API calls

## Tech Stack

- Backend: Node.js, Express, PostgreSQL
- Auth: JWT, bcrypt
- File uploads: multer, Cloudinary
- Worker: Python image verification package
- Frontend: HTML, CSS, vanilla JavaScript

## Features

- User registration, login, and profile lookup
- Complaint creation, updates, listing, and detail views
- Image uploads for complaints
- Complaint validation workflow with a Python worker
- Admin and department APIs for dashboard and management flows

## Prerequisites

- Node.js 18+ recommended
- npm
- PostgreSQL database
- Cloudinary account for image uploads
- Python 3 for the image verification worker

## Backend Setup

1. Open the backend folder:

   ```bash
   cd CityHelplineBackend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with the required settings:

   ```env
   PORT=5003
   DATABASE_URL=postgresql://user:password@localhost:5432/cityhelpline
   ACCESS_TOKEN_SECRET=your_jwt_secret

   CLOUD_NAME=your_cloudinary_cloud_name
   API_KEY=your_cloudinary_api_key
   API_SECRET=your_cloudinary_api_secret

   COMPLAINT_IMAGE_VALIDATION_MODE=off
   MAX_COMPLAINT_IMAGE_MB=8
   PYTHON_WORKER_EXECUTABLE=python3

   NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
   GEOCODE_APP_NAME=CityHelpline
   GEOCODE_CONTACT_EMAIL=you@example.com
   NODE_ENV=development
   ```

4. Start the backend:

   ```bash
   npm run dev
   ```

   The API runs on `http://localhost:5003` by default.

## Frontend Setup

The frontend is a static site located in `CityHelplineFrontend/src/`. There is no build step.

1. Serve the `src` folder with any static file server or Live Server extension.
2. Make sure the backend is running on `http://localhost:5003`, which is the value used by the frontend API config.

Example using a simple local server from the frontend folder:

```bash
cd CityHelplineFrontend/src
npx serve
```

## Common Backend Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/profile`
- `GET /api/complaints`
- `POST /api/complaints`
- `GET /api/complaints/:id`
- `PUT /api/complaints/:id`
- `DELETE /api/complaints/:id`
- `GET /api/admin/...`
- `GET /api/departments/...`

Protected routes expect an `Authorization: Bearer <token>` header.

## Notes

- Complaint image uploads use the `image` form field.
- Location fields are expected as `lat` and `long`.
- Complaint image validation can be toggled with `COMPLAINT_IMAGE_VALIDATION_MODE` using `off`, `shadow`, or `enforce`.
- The Python worker package is stored in `CityHelplineBackend/image-verification-backend-package/`.

## Testing

Backend package scripts currently include a placeholder test command. If you add automated tests, document the command here.

## License

No license file is currently included in the repository.