import * as utils from './ground_station_utils.js'

// Declaring constants
const DATA_UPDATE_INTERVAL = 5 * 1000; // Update data every 5 seconds
const CHECKSUM_SEP_CHAR = '~';
const PACKET_DELIM_CHAR = ',';
const NO_FIX_CHAR = '!';
const MIN_PLOT_DISTANCE = 5; // The minimum distance in meters required between points for them to be plotted - 0 => plot all points
const MAX_PLOT_DISTANCE = 500 * 1000;
const MIN_PATH_DISTANCE = 20; // The minimum distance in meters required between points for a line to connect them - 0 => connect all points
const MAX_PATH_DISTANCE = 500 * 1000;

let dataPointer = 0; // Stores current line in data file
let prevLoc = null; // Stores the last plotted marker as {latitude, longitude, altitude, time}
let prevPathLoc = null;
let totalPacketCounter = 0;
let goodPacketCounter = 0;
let userMarker = null;

// Leaflet Map Creation
let map = L.map('map').setView([49.182279, -122.775576], 14);
L.tileLayer('https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=MkQIEDVq5v8Isbccqcci', {
    // Setup map attributes
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
// Add map scale
L.control.scale().addTo(map);

// Create a marker containing location data and google maps directions link. Adds marker to map and returns the marker object
function createLocMarker(location, altitude, time, title, icon) {
    let getRoute = "Get Route";
    // How to format the maps query: https://developers.google.com/maps/documentation/urls/get-started
    let mapsQuery = "https://google.ca/maps/dir/?api=1&destination=" + location[0] + "," + location[1]
    let mapsLink = getRoute.link(mapsQuery);
    let marker;
    if (icon == null) {
        marker = L.marker(location).addTo(map);
    } else {
        marker = L.marker(location, {icon: icon}).addTo(map);
    }
    marker.bindPopup("<p><b>"+ title + "</b><br>"
                     + "Time: " + time + "<br>"
                     + location[0] + ", " + location[1] + "<br>"
                     + "Altitude: " + altitude + "m" + "<br><b>"
                     + mapsLink + "</b></p>");
    return marker;
}

// Accept an array [lat,long]
function toDecimalDegrees(position) {
    // Latitude Format: DDMM.MMMM
    let latArr = position[0].split('.');
    let latDeg = parseInt(latArr[0].substring(0, 2));
    let latMin = parseFloat(latArr[0].substring(2, latArr[0].length) + '.' + latArr[1]);
    
    if (isNaN(latDeg) || isNaN(latMin)) {
        return null;
    }
    let latDD = latDeg + (latMin / 60);

    // Longitude Format: DDDMM.MMMM
    let lonArr = position[1].split('.');
    let lonDeg = parseInt(lonArr[0].substring(0, 3));
    let lonMin = parseFloat(lonArr[0].substring(3, lonArr[0].length) + '.' + lonArr[1]);

    if (isNaN(lonDeg) || isNaN(lonMin)) {
        return null;
    }
    let lonDD = -1 * (lonDeg + (lonMin / 60));

    return [latDD, lonDD];
}

// Attempts to get user location
function updateUserLocation() {

    function error() {
        console.log("Error getting coordinates!");
    }

    function success(position) {
        let prevLoc = null;
        let newLoc = [position.coords.latitude, position.coords.longitude];
        if (userMarker != null) {
            prevLoc = [userMarker.getLatLng().lat, userMarker.getLatLng().lng];
            if (newLoc != prevLoc) {
                userMarker.remove();
                userMarker = null;
            }
        }
        
        if (newLoc != prevLoc) {
            userMarker = createLocMarker(newLoc, position.coords.altitude, "?", "User Location", utils.ICON_HOUSE);
        }
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error, utils.geoOptions);

    } else {
        console.log("Geolocation not available!");
    }
}

// Parses a packet and returns a dictionary defining the parsed values
// Inputs:
// packet: A string of the format <checksum>~<latitude>,<longitude>,<altitude>,<time(HH:MM:SS)>
// Output:
// On a successful parse a dictionary of format { latitude, longitude, altitude, time } is returned
// On an unsuccessful parse, a utils.PACKET_TYPE enum is returned describing the parse error
function parseData(packet) {
    let splitPacket = packet.split(CHECKSUM_SEP_CHAR);
    let receivedChecksum = parseInt(splitPacket[0]);
    let rawPacket = splitPacket[1];
    // If the checksum can't be parsed to an int, the packet is considered corrupted
    if (isNaN(receivedChecksum)) {
        return utils.PACKET_TYPE.INVALID_CHARACTERS;
    }
    if (rawPacket != undefined) {
        // Calculate checksum
        let checksum = 0;
        for (let i = 0; i < rawPacket.length; i++) {
            checksum += rawPacket.charCodeAt(i);
        }

        if (receivedChecksum != checksum) {
            return utils.PACKET_TYPE.INVALID_CHECKSUM;
        }

        let data = rawPacket.split(PACKET_DELIM_CHAR);
        // Log/Error packet
        if (data.length == 1) {
            if (data[0] == NO_FIX_CHAR) {
                return utils.PACKET_TYPE.NO_FIX;
            } else {
                return utils.PACKET_TYPE.INVALID_CHARACTERS;
            }
        // Data packet
        } else if (data.length == 4) {
            let coords = toDecimalDegrees([data[0], data[1]]);
            if (coords != null) {
                let dataDict = { 
                    latitude: coords[0],
                    longitude: coords[1],
                    altitude: data[2],
                    time: data[3]
                };
                return dataDict;
            } else {
                return utils.PACKET_TYPE.INVALID_CHARACTERS;
            }
            
        // Faulty packet
        } else {
            return utils.PACKET_TYPE.INVALID_FORMAT;
        }
    } else {
        return utils.PACKET_TYPE.INVALID_FORMAT;
    }
}

// Plots a path between 2 coordinates
// Inputs:
// coordsInit: [latitude, longitude]
// colour: string defining path colour
// smoothing: Double defining line weight
function plotPath(coordsInit, coordsFin, colour, smoothing) {
    if (coordsInit != coordsFin) {
        L.polyline([coordsInit, coordsFin], {
            color: colour,
            smoothFactor: smoothing
        }).addTo(map);
    }
}

// Updates the data displayed on the map
// Called by setInterval on a defined interval
async function updateData() {
    updateUserLocation();

    // Request the data from the server
    let response = await fetch('/data/data.txt');
    let data = await response.text();
    if (data.length > dataPointer) {
        let newFileData = data.substring(dataPointer, data.length);
        dataPointer += newFileData.length;
        let lineData = newFileData.split('\n');

        for (let i = 0; i < lineData.length - 1; i++) {
            totalPacketCounter++;
            let packet = parseData(lineData[i]);
            // Catches any packets which had values which would not parse to integers
            if (packet == utils.PACKET_TYPE.INVALID_CHARACTERS) {
                console.warn("Invalid character received.");
                utils.logData("Invalid character received.", utils.PACKET_TYPE.INVALID_CHARACTERS);

            // Catches any corrupt packets which failed the checksum test
            } else if (packet == utils.PACKET_TYPE.INVALID_CHECKSUM) {
                console.warn("Invalid checksum received.");
                utils.logData("Invalid checksum received.", utils.PACKET_TYPE.INVALID_CHECKSUM);

            // Catches any packets which could not be resolved to the proper format (missing , separators)
            } else if (packet == utils.PACKET_TYPE.INVALID_FORMAT) {
                console.warn("Invalid format received.");
                utils.logData("Invalid format received.", utils.PACKET_TYPE.INVALID_FORMAT);
            
            // Catches the NO_FIX packet
            } else if (packet == utils.PACKET_TYPE.NO_FIX) {
                console.error("No GPS fix.");
                utils.logData("No GPS fix.", utils.PACKET_TYPE.NO_FIX);

            // Packet integrity is considered good enough to plot
            } else {
                goodPacketCounter++;
                // Determine if packet should be plotted given min and max distance constants
                if (prevLoc == null) {
                    prevLoc = packet;
                    createLocMarker([packet.latitude, packet.longitude], packet.altitude, packet.time, "Received #" + goodPacketCounter + "/" + totalPacketCounter, utils.ICON_LOC_BLUE);

                } else if (utils.getDistanceBetweenCoords([prevLoc.latitude, prevLoc.longitude], [packet.latitude, packet.longitude]) >= MIN_PLOT_DISTANCE 
                        && utils.getDistanceBetweenCoords([prevLoc.latitude, prevLoc.longitude], [packet.latitude, packet.longitude]) < MAX_PLOT_DISTANCE) {
                    // Determine icon to plot based on altitude difference between previous packet
                    let icon = utils.ICON_LOC_BLUE;
                    if (packet.altitude > prevLoc.altitude) {
                        icon = utils.ICON_LOC_GREEN;

                    } else if (packet.altitude < prevLoc.altitude) {
                        icon = utils.ICON_LOC_RED;
                    }
                    prevLoc = packet;
                    createLocMarker([packet.latitude, packet.longitude], packet.altitude, packet.time, "Received #" + goodPacketCounter + "/" + totalPacketCounter, icon);
                }

                // Determine if a path should connect this point to the last stored path point given min and max path distance constants
                if (prevPathLoc == null) {
                    prevPathLoc = prevLoc;
            
                } else if (utils.getDistanceBetweenCoords([prevPathLoc.latitude, prevPathLoc.longitude], [packet.latitude, packet.longitude]) >= MIN_PATH_DISTANCE 
                        && utils.getDistanceBetweenCoords([prevPathLoc.latitude, prevPathLoc.longitude], [packet.latitude, packet.longitude]) < MAX_PATH_DISTANCE) {
                    plotPath([prevPathLoc.latitude, prevPathLoc.longitude], [packet.latitude, packet.longitude], 'blue', 1.5);
                }
                
                console.log("Received: [" + packet.latitude + ", " + packet.longitude + "], " + packet.altitude + "m, @ " + packet.time);
                utils.logData("Received: [" + packet.latitude + ", " + packet.longitude + "], " + packet.altitude + "m, @ " + packet.time);
            }
        }
    }
}

// Update the data being displayed on the map
// TODO: defer param in setup
setInterval(updateData, DATA_UPDATE_INTERVAL);