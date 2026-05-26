# Implementation Plan: GloveBox - Auto Maintenance & Receipt Tracker

`GloveBox` is a sleek, local-first web application designed for mobile and desktop use to track vehicle maintenance (oil changes, transmission oil changes, air filter replacements) and modifications. It features local-only SQLite storage, receipt photo storage, a **custom browser-side document scanner** (with perspective warp and shadow removal), and an instant Docker-based deployment.

---

## User Review Required

> [!IMPORTANT]
> **Key Technical Decisions for User Review:**
> 1. **Client-Side Processing:** The perspective warping and "Google Docs-style" photo scan filtering are performed **entirely in the browser** using a custom lightweight canvas-based homography engine and a fast division-normalization image-processing filter. This avoids heavy server-side processing, is privacy-focused, and keeps the server extremely lightweight.
> 2. **Local Storage:** All database entries are stored in a local SQLite file, and receipts are saved as standard static images. These will be kept in a persistent directory (`/app/data`) that is exposed as a Docker volume for backup.
> 3. **Single-Container Deployment:** To make deployment "at a glance", we package both the Node.js Express server and the compiled Vite React client into a single Docker image, running on a single port (e.g., `8080` or `3000`).

---

## Proposed Changes

We will organize the codebase into two main directories: `server/` (Express API and SQLite database) and `client/` (Vite + React single-page app), with a root `Dockerfile` and `docker-compose.yml` for unified execution.

### Project Root Components

#### [package.json](file:///d:/Productivity/Repos/glove-box/package.json)
- Configures root-level scripts to run both client and server in development concurrently using `concurrently`.

#### [Dockerfile](file:///d:/Productivity/Repos/glove-box/Dockerfile)
- Multi-stage Docker file:
  1. **Build Client:** Installs frontend dependencies and builds the Vite app into a static `dist/` directory.
  2. **Final Image:** Installs backend dependencies, copies the client build to be served statically by Express, sets up folders, and sets the startup command.

#### [docker-compose.yml](file:///d:/Productivity/Repos/glove-box/docker-compose.yml)
- Sets up the `glovebox` service.
- Maps port `3000` to the host.
- Binds a persistent volume `/app/data` to a local folder (e.g. `./data`) to store the `database.sqlite` file and the `uploads/` directory containing receipt images.

---

### Backend (Server) Components

#### [server/package.json](file:///d:/Productivity/Repos/glove-box/server/package.json)
- Lists backend dependencies: `express`, `sqlite3`, `multer` (for upload handling), `cors`, and `dotenv`.

#### [server/db.js](file:///d:/Productivity/Repos/glove-box/server/db.js)
- Initializes SQLite database using `sqlite3`.
- Creates the `records` table if it does not exist:
  ```sql
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,         -- 'oil_change', 'transmission_oil', 'air_filter', 'custom_maintenance', 'modification'
    title TEXT NOT NULL,            -- e.g. "Full Synthetic 5W-30" or "Cabin Filter"
    kms INTEGER NOT NULL,           -- Odometer reading
    date TEXT NOT NULL,             -- YYYY-MM-DD
    cost REAL DEFAULT 0.0,          -- Total cost
    notes TEXT,                     -- Additional details
    receipt_image TEXT,             -- File path/name of receipt image
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  ```

#### [server/server.js](file:///d:/Productivity/Repos/glove-box/server/server.js)
- Handles express routing:
  - Serves compiled static frontend files from `../client/dist` (production mode).
  - Handles photo uploads using `multer`. File names will be timestamped to avoid collisions.
  - API Endpoints:
    - `GET /api/records` - Retrieves all records sorted by date/kms.
    - `POST /api/records` - Creates a new record with optional receipt upload.
    - `PUT /api/records/:id` - Edits an existing record.
    - `DELETE /api/records/:id` - Deletes a record and deletes the corresponding receipt image from disk.
  - Handles a fallback route to serve `index.html` for React routing.

---

### Frontend (Client) Components

We will build a high-fidelity, phone-first Vite React application styled with premium custom Vanilla CSS (supporting dark mode, glowing borders, smooth card transitions, and modern glassmorphism).

#### [client/package.json](file:///d:/Productivity/Repos/glove-box/client/package.json)
- Standard React + Vite setup.

#### [client/vite.config.js](file:///d:/Productivity/Repos/glove-box/client/vite.config.js)
- Standard Vite React configuration. Configures proxy for development (`/api` -> `http://localhost:3000`).

#### [client/index.html](file:///d:/Productivity/Repos/glove-box/client/index.html)
- Main HTML entry. Includes a modern font (e.g., *Outfit* or *Inter* from Google Fonts) and appropriate mobile viewport meta tags to prevent zooming during input.

#### [client/src/index.css](file:///d:/Productivity/Repos/glove-box/client/src/index.css)
- Premium styling system:
  - Curated dark theme palette: Slate dark background (`#0b0f19`), neon teal accents (`#00f2fe`), deep violet gradients.
  - Responsive layout utilities (auto-grid layouts).
  - Glassmorphic card styling (`backdrop-filter: blur(12px)`).
  - Micro-animations for buttons, cards, list expansions, and the scanner magnifier.

#### [client/src/main.jsx](file:///d:/Productivity/Repos/glove-box/client/src/main.jsx)
- React entry point.

#### [client/src/App.jsx](file:///d:/Productivity/Repos/glove-box/client/src/App.jsx)
- Top-level routing and state.
- Tracks active views: Dashboard (default), Record List, Add/Edit Form.

#### [client/src/components/Dashboard.jsx](file:///d:/Productivity/Repos/glove-box/client/src/components/Dashboard.jsx)
- Renders stunning visual indicators:
  - Circular gauge showing kilometers remaining until the next oil change (e.g., target 8,000 km).
  - Visual summary cards showing: Total Maintenance Cost, Total Logs Count, and Car Current Mileage.
  - Quick-add button.
  - Visual timeline or recent logs widget.

#### [client/src/components/RecordForm.jsx](file:///d:/Productivity/Repos/glove-box/client/src/components/RecordForm.jsx)
- Handles logging maintenance or modifications.
- Category selector: standard (Oil, Transmission, Air Filter) vs. Custom.
- Automatically selects the current date as default (editable).
- Camera capture or file picker button for the receipt.
- Triggers the document scanner interface if a picture is selected/taken.

#### [client/src/components/DocumentScanner.jsx](file:///d:/Productivity/Repos/glove-box/client/src/components/DocumentScanner.jsx)
- **The Core Premium Feature:**
  - Opens a full-screen overlays modal.
  - Renders the uploaded image in a canvas.
  - Renders **4 draggable handles** representing the corners of the receipt, connected by glowing guide lines.
  - **Magnifier Overlay:** When dragging a handle, displays a zoomed-in circular preview of the canvas at the handle location for pixel-perfect corner positioning.
  - **Perspective Warp Engine:** Uses a closed-form 2D homography solver to warp the selected quadrilateral into a flat rectangular document.
  - **Photo Scan Filters:**
    1. **Original:** Flat warp, no color filters.
    2. **Photo Scan (Color):** Custom canvas filter that divides the image pixels by a fast box-blurred version of themselves. This homomorphic filtering completely strips shadows, wrinkles, and ambient lighting, resulting in a crisp white background with bold colors.
    3. **Photo Scan (B&W):** Converts the output of the color scan into stark high-contrast grayscale.
    4. **Grayscale:** Standard monochrome document filter.
  - Enables user to inspect the scan, pick a filter, and save the result as a compressed JPEG blob for upload.

#### [client/src/components/RecordList.jsx](file:///d:/Productivity/Repos/glove-box/client/src/components/RecordList.jsx)
- Displays past records filterable by type and searchable.
- Clicking any record expands it to show full notes, costs, and the receipt thumbnail.
- Clicking the receipt thumbnail opens a high-resolution lightbox with pinch-to-zoom/pan capabilities.

---

## Verification Plan

### Automated Tests
- Since the workspace is empty, we will verify the code builds and compiles using build commands:
  - `npm run build` inside `client/` to verify Vite assets build without warnings.
  - Node.js backend validation by spinning it up locally and testing API responses via healthchecks.

### Manual & Interactive Verification
- **Web App Test:** Launching the dev server and loading it in the browser.
- **Scanner Verification:**
  - Mock uploading an angled photo of a document.
  - Drag the handles to warp the document corners.
  - Apply the **Photo Scan (Color)** filter and confirm that uneven ambient shadows are removed, turning the paper background pure white while keeping text legible.
  - Confirm saving the receipt attaches it to the maintenance entry.
- **Docker Verification:**
  - Build the Docker container locally using `docker compose up --build`.
  - Validate that the sqlite database file and upload files successfully write to the mounted volume on the host, ensuring data persists when the container restarts.
