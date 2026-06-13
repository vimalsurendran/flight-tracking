import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Popup,
  useMapEvents
} from "react-leaflet";
import L from "leaflet";

const REFRESH_INTERVAL = 15000;

function getAircraftColor(ac) {
  const alt = Number(ac.alt_baro);

  if (!alt || isNaN(alt)) return "#666666";
  if (alt < 1000) return "#ff0000";
  if (alt < 10000) return "#ff8800";
  if (alt < 25000) return "#ffd700";
  if (alt < 40000) return "#00cc44";
  return "#0066ff";
}

function createAircraftIcon(ac) {
  const color = getAircraftColor(ac);

  return L.divIcon({
    className: "",
    html: `
      <div
        style="
          color:${color};
          font-size:24px;
          font-weight:bold;
          transform:rotate(${ac.track || 0}deg);
          transform-origin:center center;
        "
      >
        ✈
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    }
  });

  return null;
}

export default function FlightTracker() {
  const [center, setCenter] = useState({
    lat: 8.5,
    lng: 77.0
  });

  const [sidebarOpen, setSidebarOpen] = useState(
  window.innerWidth > 768
);

  const [search, setSearch] = useState("");
  
  const [radius, setRadius] = useState(100);

  const [aircraft, setAircraft] = useState([]);

  const [expandedFlight, setExpandedFlight] = useState(null);

  const [locationInfo, setLocationInfo] = useState("");

  const mapRef = useRef();

  const fetchFlights = async (lat, lng, radiusNm) => {
    try {
      const url =
        `https://api.airplanes.live/v2/point/${lat}/${lng}/${radiusNm}`;

      const response = await fetch(url);

      const data = await response.json();

      setAircraft(data.ac || []);
    } catch (err) {
      console.error("Flight API error:", err);
    }
  };

  function toggleFlight(hex) {
  setExpandedFlight(prev =>
    prev === hex ? null : hex
  );
}
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        const newCenter = { lat, lng };

        setCenter(newCenter);

        setLocationInfo(
          `Accuracy ±${Math.round(
            position.coords.accuracy
          )}m`
        );

        fetchFlights(lat, lng, radius);

        if (mapRef.current) {
          mapRef.current.flyTo(
            [lat, lng],
            10
          );
        }
      },
      (err) => {
        console.error(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  };

  useEffect(() => {
    fetchFlights(
      center.lat,
      center.lng,
      radius
    );

    const timer = setInterval(() => {
      fetchFlights(
        center.lat,
        center.lng,
        radius
      );
    }, REFRESH_INTERVAL);

    return () => clearInterval(timer);
  }, [center, radius]);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh"
      }}
    >
      <div
        style={{
          flex: 1,
          position: "relative"
        }}
      >
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            top: 10,
            left: 10,
            background: "white",
            padding: 10,
            borderRadius: 6,
            boxShadow:
              "0 2px 8px rgba(0,0,0,.2)"
          }}
        >
          <div>
            <button
              onClick={
                getCurrentLocation
              }
            >
              Use My Location
            </button>
          </div>

          <div
            style={{
              marginTop: 10
            }}
          >
            Radius (NM)
            <input
              type="number"
              value={radius}
              onChange={(e) =>
                setRadius(
                  Number(
                    e.target.value
                  )
                )
              }
              style={{
                width: 80,
                marginLeft: 10
              }}
            />
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 12
            }}
          >
            {locationInfo}
          </div>

          <div
            style={{
              marginTop: 10
            }}
          >
            Aircraft: {aircraft.length}
          </div>
        </div>
            <button
  onClick={() => setSidebarOpen(!sidebarOpen)}
  style={{
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 2000,
    padding: "10px 14px",
    border: "none",
    borderRadius: "6px",
    background: "#1976d2",
    color: "white",
    cursor: "pointer"
  }}
>
  {sidebarOpen ? "✖ Flights" : "☰ Flights"}
</button>
        <MapContainer
          center={[
            center.lat,
            center.lng
          ]}
          zoom={8}
          style={{
            height: "100%",
            width: "100%"
          }}
          whenCreated={(map) => {
            mapRef.current = map;
          }}
        >
          <TileLayer
            attribution="© OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler
            onMapClick={(latlng) => {
              setCenter({
                lat: latlng.lat,
                lng: latlng.lng
              });
            }}
          />

          <Circle
            center={[
              center.lat,
              center.lng
            ]}
            radius={
              radius * 1852
            }
            pathOptions={{
              color: "blue"
            }}
          />

          {aircraft.map((ac) => {
            if (
              !ac.lat ||
              !ac.lon
            )
              return null;

            return (
              <Marker
                key={
                  ac.hex ||
                  `${ac.lat}-${ac.lon}`
                }
                position={[
                  ac.lat,
                  ac.lon
                ]}
                icon={createAircraftIcon(
                  ac
                )}
                eventHandlers={{
  click: () => {
    setExpandedFlight(ac.hex);
  }
}}
              >
                <Popup>
                  <b>
                    {ac.flight ||
                      "Unknown"}
                  </b>
                  <br />
                  {ac.t}
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div
  style={{
  width: 400,
  maxWidth: "90vw",
  borderLeft: "1px solid #ddd",
  overflowY: "auto",
  background: "#fafafa",

  position:
    window.innerWidth <= 768
      ? "absolute"
      : "relative",

  top: 0,
  right: 0,
  bottom: 0,

  zIndex: 1500,

  transform:
    sidebarOpen
      ? "translateX(0)"
      : "translateX(100%)",

  transition:
    "transform 0.3s ease"
}}
>
  <div style={{ padding: 10 }}>
  <input
    type="text"
    placeholder="Search flight..."
    value={search}
    onChange={(e) =>
      setSearch(e.target.value)
    }
    style={{
      width: "100%",
      padding: 8
    }}
  />
</div>

  {aircraft
    .filter(ac =>
  (ac.flight || "")
    .toLowerCase()
    .includes(search.toLowerCase())
)
    .map(ac => {

      const expanded =
        expandedFlight === ac.hex;

      return (
        <div
          key={ac.hex}
          style={{
            borderBottom:
              "1px solid #e5e5e5"
          }}
        >
          <div
            onClick={() =>
              toggleFlight(ac.hex)
            }
            style={{
              cursor: "pointer",
              padding: "12px",
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
              background: expanded
                ? "#eef5ff"
                : "#fff"
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 600
                }}
              >
                {ac.flight ||
                  "Unknown"}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#666"
                }}
              >
                {ac.t || "N/A"}
              </div>
            </div>

            <div>
              {expanded
                ? "▼"
                : "▶"}
            </div>
          </div>

          {expanded && (
            <div
              style={{
                padding: "12px",
                background:
                  "#f8fbff",
                fontSize: 14
              }}
            >
              <div>
                <b>ICAO:</b>{" "}
                {ac.hex}
              </div>

              <div>
                <b>Registration:</b>{" "}
                {ac.r || "-"}
              </div>

              <div>
                <b>Type:</b>{" "}
                {ac.t || "-"}
              </div>

              <div>
                <b>Altitude:</b>{" "}
                {ac.alt_baro || "-"} ft
              </div>

              <div>
                <b>Speed:</b>{" "}
                {ac.gs || "-"} kt
              </div>

              <div>
                <b>Heading:</b>{" "}
                {ac.track || "-"}°
              </div>

              <div>
                <b>Squawk:</b>{" "}
                {ac.squawk || "-"}
              </div>

              <div>
                <b>Latitude:</b>{" "}
                {ac.lat}
              </div>

              <div>
                <b>Longitude:</b>{" "}
                {ac.lon}
              </div>

              <div>
                <b>Emergency:</b>{" "}
                {ac.emergency ||
                  "None"}
              </div>

              <button
                style={{
                  marginTop: 10
                }}
                onClick={() => {
                  mapRef.current?.flyTo(
                    [
                      ac.lat,
                      ac.lon
                    ],
                    11
                  );
                }}
              >
                Locate on Map
              </button>
            </div>
          )}
        </div>
      );
    })}
</div>
    </div>
  );
}