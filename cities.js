// Initialize the map centered on the UK
const map = L.map('map').setView([54.5, -4], 6);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: ' OpenStreetMap contributors'
}).addTo(map);

// Initialize drawing controls
const drawnItems = new L.FeatureGroup();
const cityMarkers = new L.FeatureGroup();
map.addLayer(drawnItems);
map.addLayer(cityMarkers);

// Initialize drawing controls
const drawControl = new L.Control.Draw({
    position: 'topright',
    draw: {
        polygon: {
            allowIntersection: false,
            drawError: {
                color: '#e1e100',
                timeout: 1000
            },
            shapeOptions: {
                color: '#2196F3'
            },
            showArea: true
        },
        rectangle: {
            shapeOptions: {
                color: '#2196F3'
            }
        },
        // Disable other drawing tools
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false
    },
    edit: {
        featureGroup: drawnItems,
        remove: true
    }
});
map.addControl(drawControl);

// Set UK bounds
const ukBounds = L.latLngBounds(
    [49.8, -8.6], // Southwest corner
    [60.9, 1.8]   // Northeast corner
);

// Restrict map to UK
map.setMaxBounds(ukBounds);
map.on('drag', function() {
    map.panInsideBounds(ukBounds, { animate: false });
});

// Store current cities
let currentCities = [];

// Function to get city coordinates using postcodes.io API
async function getCityCoordinates() {
    document.querySelector('.cities-count').textContent = 'Loading cities...';

    const cityPromises = ukCities.map(async city => {
        try {
            // Try to find a postcode for the city center
            const response = await fetch(`https://api.postcodes.io/postcodes?q=${encodeURIComponent(city.name)}&limit=1`);
            const data = await response.json();

            if (data.result && data.result.length > 0) {
                return {
                    ...city,
                    latitude: data.result[0].latitude,
                    longitude: data.result[0].longitude,
                    postcode: data.result[0].postcode
                };
            }
        } catch (error) {
            console.error(`Error fetching coordinates for ${city.name}:`, error);
        }
        return city;
    });

    const citiesWithCoordinates = await Promise.all(cityPromises);
    ukCities.splice(0, ukCities.length, ...citiesWithCoordinates);
    document.querySelector('.cities-count').textContent = 'Draw a shape to find cities';
}

// Function to create a city marker
function createCityMarker(city) {
    const marker = L.marker([city.latitude, city.longitude], {
        title: city.name
    });

    marker.bindPopup(`
        <div style="text-align: center;">
            <h3 style="margin: 0 0 5px 0;">${city.name}</h3>
            <div style="color: #666;">Population: ${city.population.toLocaleString()}</div>
            <div style="color: #FF4438; font-weight: bold; margin-top: 5px;">${city.areaCode}</div>
        </div>
    `);

    return marker;
}

// Function to check if a city is inside any of the drawn shapes
function isCityInShapes(city, layers) {
    for (const layer of layers) {
        if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
            const bounds = layer.getBounds();
            const cityLatLng = L.latLng(city.latitude, city.longitude);

            if (bounds.contains(cityLatLng)) {
                return true;
            }
        }
    }
    return false;
}

// Function to update cities list based on drawn shapes and population filter
function updateCitiesList(layers) {
    const citiesList = document.getElementById('cities-list');
    const downloadBtn = document.getElementById('download-btn');
    const citiesCount = document.querySelector('.cities-count');
    const populationFilter = parseInt(document.getElementById('population-filter').value);

    cityMarkers.clearLayers();

    if (!layers || layers.length === 0) {
        citiesList.innerHTML = '';
        citiesCount.textContent = 'Draw a shape to find cities';
        downloadBtn.disabled = true;
        currentCities = [];
        return;
    }

    // Filter cities within the shapes and by population
    currentCities = ukCities.filter(city => {
        return city.latitude &&
               city.longitude &&
               city.population >= populationFilter &&
               isCityInShapes(city, layers);
    });

    if (currentCities.length === 0) {
        citiesList.innerHTML = '<div class="no-results">No major cities found in these areas</div>';
        citiesCount.textContent = 'No cities found';
        downloadBtn.disabled = true;
        return;
    }

    // Sort cities by population
    currentCities.sort((a, b) => b.population - a.population);

    // Update cities count
    citiesCount.textContent = `${currentCities.length} ${currentCities.length === 1 ? 'city' : 'cities'} found`;

    // Add markers to the map
    currentCities.forEach(city => {
        const marker = createCityMarker(city);
        cityMarkers.addLayer(marker);
    });

    // Display cities
    citiesList.innerHTML = currentCities
        .map(city => `
            <div class="city-item" data-lat="${city.latitude}" data-lng="${city.longitude}">
                <div class="city-info">
                    <div class="city-name">${city.name}</div>
                    <div class="city-population">Population: ${city.population.toLocaleString()}</div>
                </div>
                <div class="area-code">${city.areaCode}</div>
            </div>
        `)
        .join('');

    // Enable download button
    downloadBtn.disabled = false;

    // Add click handlers to city items
    document.querySelectorAll('.city-item').forEach(item => {
        item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat);
            const lng = parseFloat(item.dataset.lng);
            map.setView([lat, lng], 12);

            // Find and open the corresponding marker's popup
            cityMarkers.getLayers().forEach(marker => {
                if (marker.getLatLng().lat === lat && marker.getLatLng().lng === lng) {
                    marker.openPopup();
                }
            });
        });
    });
}

// Initialize city coordinates when the page loads
getCityCoordinates().catch(console.error);

// Handle population filter change
document.getElementById('population-filter').addEventListener('change', () => {
    updateCitiesList(drawnItems.getLayers());
});

// Handle drawing events
map.on(L.Draw.Event.CREATED, async function (event) {
    const layer = event.layer;
    drawnItems.addLayer(layer);

    // Show loading state
    const citiesList = document.getElementById('cities-list');
    citiesList.innerHTML = '<div class="loading">Finding cities...</div>';
    document.getElementById('download-btn').disabled = true;

    try {
        updateCitiesList(drawnItems.getLayers());
    } catch (error) {
        console.error('Error updating cities:', error);
        citiesList.innerHTML = '<div class="error">Error finding cities. Please try again.</div>';
    }
});

// Handle shape deletion
map.on(L.Draw.Event.DELETED, function (event) {
    const layers = drawnItems.getLayers();
    if (layers.length === 0) {
        document.getElementById('cities-list').innerHTML = '';
        document.querySelector('.cities-count').textContent = 'Draw a shape to find cities';
        document.getElementById('download-btn').disabled = true;
        cityMarkers.clearLayers();
        currentCities = [];
    } else {
        updateCitiesList(layers);
    }
});

// Reset button functionality
document.getElementById('reset-btn').addEventListener('click', function() {
    drawnItems.clearLayers();
    cityMarkers.clearLayers();
    document.getElementById('cities-list').innerHTML = '';
    document.querySelector('.cities-count').textContent = 'Draw a shape to find cities';
    document.getElementById('download-btn').disabled = true;
    currentCities = [];
});

// Download button functionality
document.getElementById('download-btn').addEventListener('click', function() {
    if (!currentCities.length) return;

    // Create CSV content
    const csvContent = [
        ['City', 'Population', 'Area Code', 'Latitude', 'Longitude'].join(','),
        ...currentCities.map(city => [
            city.name,
            city.population,
            city.areaCode,
            city.latitude,
            city.longitude
        ].join(','))
    ].join('\n');

    // Create blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    // Set up download link
    link.href = URL.createObjectURL(blob);
    link.download = `uk_cities_${new Date().toISOString().split('T')[0]}.csv`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Prevent map from zooming too far out
map.setMinZoom(5);
