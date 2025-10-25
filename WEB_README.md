# NPWS Alerts Web Interface

A web-based map interface for viewing and filtering NSW National Parks alerts with geospatial visualization using Leaflet/OpenStreetMap.

## Features

- **Interactive Map**: View all park alerts on an interactive OpenStreetMap-based map
- **Filtering**: Filter alerts by category, time period (current/future), and park name
- **Click for Details**: Click on any park marker to view detailed alert information
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Data**: Displays data directly from the SQLite database
- **Category Colors**: Visual color-coding based on alert severity and category

## Quick Start

### 1. Ensure Data is Available

Make sure you've run the data sync at least once to populate the database:

```bash
npm run fetch-once
```

### 2. Start the Web Server

```bash
npm run web
```

The server will start at http://localhost:3000

### 3. Open in Browser

Open your browser and navigate to:
```
http://localhost:3000
```

## API Endpoints

The web server provides several RESTful API endpoints:

### Get All Alerts
```
GET /api/alerts
```

Query parameters:
- `category` - Filter by alert category
- `is_future` - Filter by time (true/false)
- `park_name` - Search by park name (partial match)

Example:
```
GET /api/alerts?category=Fire%20bans&is_future=false
```

### Get Alerts with Reserve Information
```
GET /api/alerts/with-reserves
```

Returns alerts joined with reserve data including geometry for mapping.

Query parameters:
- `category` - Filter by alert category
- `is_future` - Filter by time (true/false)

Example:
```
GET /api/alerts/with-reserves?category=Closed%20parks
```

### Get Alert Categories
```
GET /api/alerts/categories
```

Returns list of unique alert categories for filter dropdown.

### Get All Reserves
```
GET /api/reserves
```

Returns all reserve records with metadata.

### Get Reserve by Name
```
GET /api/reserves/:name
```

Example:
```
GET /api/reserves/Blue%20Mountains%20National%20Park
```

### Get Statistics
```
GET /api/stats
```

Returns database statistics including:
- Total alerts count
- Total reserves count
- Last sync timestamp
- Category breakdown

## Map Features

### Marker Colors

Markers are color-coded based on alert severity:
- **Red** (#e74c3c): Closed parks
- **Orange** (#f39c12): Fire bans
- **Blue** (#3498db): Other planned events
- **Purple** (#8e44ad): Other incidents
- **Gray** (#95a5a6): Default/other categories

### Marker Numbers

Each marker displays the number of alerts for that park location.

### Popup Information

Clicking a marker shows a popup with:
- Park name
- Number of alerts
- Alert categories
- Preview of first 2 alerts
- "View Details" button

### Details Panel

The details panel (right side) shows:
- Full alert title and description
- Park name and status (Open/Closed/Partially Closed)
- Alert category badge
- Effective dates
- Last reviewed date
- Reserve information (name, type, area)

## Filtering

### Category Filter
Select from available categories:
- Current alerts
- Fires - Advice
- Fire bans
- Closed parks
- Closed areas
- Safety alerts
- Other incidents
- Other planned events

### Time Filter
- **Current Alerts**: Show only current alerts (default)
- **Future Alerts**: Show only future/planned alerts
- **All Alerts**: Show both current and future

### Search
Enter park name to filter to specific parks (partial matching supported).

## Development

### Run in Watch Mode

For development with auto-reload:

```bash
npm run web:watch
```

### Directory Structure

```
src/web/
  └── server.ts          # Express API server

public/
  ├── index.html         # Main HTML page
  ├── styles.css         # CSS styling
  └── app.js             # Client-side JavaScript
```

### Customization

**Change Port:**
Set the PORT environment variable:
```bash
PORT=8080 npm run web
```

**Modify Map Center:**
Edit `app.js` line with `map.setView()`:
```javascript
map = L.map('map').setView([-32.5, 147.0], 7); // [lat, lon], zoom
```

**Change Marker Colors:**
Edit `CATEGORY_COLORS` object in `app.js`:
```javascript
const CATEGORY_COLORS = {
    'Closed parks': '#e74c3c',  // Red
    'Fire bans': '#f39c12',      // Orange
    // ...
};
```

## Technology Stack

- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (better-sqlite3)
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Mapping**: Leaflet.js + OpenStreetMap tiles
- **Data Source**: NPWS Alerts API + ArcGIS REST Services

## Performance Notes

- The first load fetches all alerts with reserves (typically 400-800 alerts)
- Filtering is done server-side for categories and time
- Search filtering is done client-side for better responsiveness
- Geometry data is parsed on-demand when displaying alerts
- Map markers are clustered by park to reduce clutter

## Troubleshooting

### No Markers Showing on Map

**Issue**: Alerts loaded but no markers appear on map.

**Solution**:
- Check browser console for JavaScript errors
- Verify geometry data exists: `curl http://localhost:3000/api/alerts/with-reserves | grep geometry`
- Ensure data sync completed successfully with geometry enabled

### Server Won't Start

**Issue**: Port 3000 already in use.

**Solution**:
```bash
# Use different port
PORT=8080 npm run web

# Or kill process using port 3000
lsof -ti:3000 | xargs kill
```

### Slow Initial Load

**Issue**: Takes long time to load all alerts.

**Solution**:
- This is normal for first load with 5000+ reserves
- Data is cached in database after first sync
- Consider adding pagination or lazy loading for very large datasets

### Map Tiles Not Loading

**Issue**: Map shows gray tiles.

**Solution**:
- Check internet connection (tiles are loaded from OpenStreetMap servers)
- Try different tile provider in `app.js`:
  ```javascript
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
  }).addTo(map);
  ```

## Future Enhancements

- [ ] Marker clustering for better performance with many alerts
- [ ] Polygon rendering for reserve boundaries
- [ ] Export filtered results to GeoJSON
- [ ] Save/share filter combinations
- [ ] Mobile-optimized detail panel
- [ ] Dark mode support
- [ ] Search autocomplete
- [ ] Alert history timeline
- [ ] RSS feed for new alerts

## API Response Examples

### Stats Response
```json
{
  "success": true,
  "data": {
    "alerts": 428,
    "reserves": 5054,
    "lastSync": "2025-10-25 00:08:37",
    "categoryBreakdown": [
      {"alert_category": "Closed areas", "count": 191},
      {"alert_category": "Fire bans", "count": 25}
    ]
  }
}
```

### Alert with Reserve Response
```json
{
  "success": true,
  "count": 1,
  "data": [{
    "id": 1,
    "alert_id": "npws-fis@id.ngcomms.net/eme/8478122",
    "park_name": "Abercrombie Karst Conservation Reserve",
    "park_id": "44d91af1-3a2e-4173-8bcc-e22030cb02a5",
    "alert_title": "Park Closed",
    "alert_description": "<p>Abercrombie Karst...</p>",
    "alert_category": "Closed parks",
    "start_date": "2022-05-09T09:53:43",
    "end_date": "2026-01-31T17:00:00",
    "park_closed": 1,
    "reserve_name": "Abercrombie Karst Conservation Reserve",
    "reserve_type": "KARST CONSERVATION RESERVE",
    "geometry": {
      "rings": [[[149.123, -33.456], ...]],
      "spatialReference": {"wkid": 4326}
    }
  }]
}
```

## License

MIT

## Credits

- Map tiles: © OpenStreetMap contributors
- Data source: NSW National Parks & Wildlife Service
- Mapping library: Leaflet.js
