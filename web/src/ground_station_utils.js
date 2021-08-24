export const ICON_CIRCLE_BLACK = L.icon({
    iconUrl: '/res/circle_black_marker.png',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, 0]
});

export const ICON_HOUSE = L.icon({
    iconUrl: '/res/home_marker.png',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

export const ICON_LOC_GREEN = L.icon({
    iconUrl: '/res/green_marker.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, 0]
});

export const ICON_LOC_RED = L.icon({
    iconUrl: '/res/red_marker.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, 0]
});

export const ICON_LOC_BLUE = L.icon({
    iconUrl: '/res/blue_marker.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, 0]
});

// May not need this
export function getUserLocation() {
    if (navigator.geolocation()) {
        let latitude, longitude;
        navigator.geolocation.getCurrentPosition((position) => {
            latitude = position.coords.latitude;
            longitude = position.coords.longitude;
        });
        return [latitude, longitude];

    } else {
        return null;
    }
}

export function addToLog() {
    document.getElementById("")
}