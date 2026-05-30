# 🗃️ GloveBox - Auto Maintenance & Scanned Receipt Tracker

`GloveBox` is a sleek, local-first web application designed primarily for mobile phone browsers (but looking stunning on desktop) to log vehicle maintenance items (such as oil changes, transmission oil changes, and air filters) and modifications. 

It keeps all your records, costs, and receipt documents entirely local. It features a **custom browser-side document scanner overlay** that lets you drag receipt corners and enhances the photo using shadow-removal filters—replicating the document scans of Google Docs locally in the browser!

---

## 🌟 Key Features

* **Multi-Vehicle Garage:** Manage an entire fleet of cars from a single instance with dedicated dashboards, custom service intervals, and isolated records.
* **Vehicle Health Dashboard:** View current mileage, total maintenance costs, and a visual Timeline of recent actions.
* **Oil Change Radial Gauge:** Automatically tracks target intervals (e.g., `8,000 km` or `6 months`) and alerts you when your next oil change is approaching or overdue.
* **Fuel Tracking & Economy:** Log your fuel fill-ups to automatically calculate distance traveled, cost, and L/100km fuel efficiency math.
* **Custom Modifications & Upgrades Logging:** Categorize items as standard maintenance or modifications with custom titles, mileage logs, and notes.
* **Advanced Fleet Exports:** Export your service history as CSV spreadsheets or generate beautiful, printable HTML reports for a single vehicle or your entire garage. Easily filter exports by the current year or all-time logs.
* **Camera Capture with Client-Side Document Scanner:**
  * Auto-activates on photo capture or file upload.
  * **4 Draggable Handles Overlay:** Easily trace the bounds of your receipt.
  * **Precision Magnifying Glass Lens:** Zooms in $2\times$ on drag for pixel-perfect anchor positioning (even on small touchscreens!).
  * **Homography Perspective Warp:** Automatically flattens tilted photos into rectangular documents.
  * **Division-Normalization Photo Scan Filter:** Employs a custom homomorphic shadow-removal canvas filter. It strips uneven ambient shadows, wrinkles, and crumples—resulting in crisp, pure-white backgrounds with bold ink colors.
* **100% Local Storage:** Runs on SQLite with physical upload folders, ensuring privacy and offline compatibility.
* **Single-Container Docker Deployment:** Packaged into a single multi-stage Docker image for instant deployment.

---

## 📂 Project Structure

```text
glove-box/
├── client/                     # Vite + React Frontend Single-Page App
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx   # Metrics grid, timeline, and radial gauges
│   │   │   ├── DocumentScanner.jsx # Interactive cropping canvas & magnifier lens
│   │   │   ├── RecordForm.jsx  # Input logs validation and camera trigger
│   │   │   └── RecordList.jsx  # Search filters and zoom/pan receipt Lightbox
│   │   ├── utils/
│   │   │   └── scannerUtils.js # 2D Homography warp & division blur filters
│   │   ├── App.jsx             # Shared routing and API controller
│   │   ├── index.css           # Curated CSS styling system
│   │   └── main.jsx            # Entry point
│   ├── index.html              # HTML templates, Google Fonts
│   └── vite.config.js          # Configures proxy targets
├── server/                     # Node.js + Express API Backend
│   ├── db.js                   # SQLite database initialization
│   ├── server.js               # REST CRUD endpoints & multer configurations
│   └── package.json            # Server package configurations
├── Dockerfile                  # Multi-stage client build & Express runner
├── docker-compose.yml          # Persistent Docker local volume mapper
├── package.json                # Coordination scripts
└── README.md                   # Setup documentation
```

---

## 🚀 Getting Started

### Method 1: Deploying at a Glance (Docker Compose) - *Recommended*

To run GloveBox in production on a Linux server (or local machine) in seconds, run:

```bash
docker compose up -d --build
```

* **Access the App:** Open your browser and navigate to `http://localhost:3000` (or the IP of your server).
* **Data Persistence:** All logs and scanned receipts are stored securely in a local folder called `./data` inside the root workspace directory. This folder is mapped into the container, allowing you to back up your database and receipts easily.

---

### Method 2: Local Development Setup

To run GloveBox on your computer for editing or local development:

#### 1. Install Dependencies
Run the helper installer script from the root workspace directory to install dependencies for root, client, and server concurrently:
```bash
npm run install:all
```

#### 2. Start the Development Servers
Start both the Express backend and the Vite frontend concurrently in development mode:
```bash
npm run dev
```

* **Vite Frontend Dev Server:** Runs on `http://localhost:5173`.
* **Express Backend Dev Server:** Runs on `http://localhost:3000`.
* **Proxy Routing:** Any calls made to `/api` or `/uploads` from the frontend are proxied automatically to `http://localhost:3000` in the background.

---

## 🧼 Google Coding Style Compliance

All components in this repository comply strictly with the **Google Javascript & CSS Style Guides**:
1. **Modern JS Control:** Standard usage of `const` and `let` declarations (avoiding legacy `var`).
2. **Modular Organization:** Separate components for dashboard rendering, forms processing, canvas warping, and lightbox zooming.
3. **Structured Semicolons & Styling:** Structured block spaces, explicit semicolons, JSDoc headers, and camelCase casing.
4. **HTML Viewport Optimization:** Set the viewport to prevent automatic zooming on text input focus inside mobile browsers (`maximum-scale=1.0, user-scalable=no`), ensuring a native-app-like user interface.
