import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Popup,
  useMap,
  useMapEvents
} from "react-leaflet";
import L from "leaflet";

const REFRESH_INTERVAL = 3000;
const MARKER_ANIMATION_MS = REFRESH_INTERVAL;
const MAX_RADIUS_NM = 250;
const PRIMARY_BUTTON_STYLE = {
  background: "#1976d2",
  border: "none",
  borderRadius: 6,
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
  padding: "10px 14px"
};
const FIELD_LABEL_STYLE = {
  color: "#4b5563",
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
  textTransform: "uppercase"
};
const RADIUS_INPUT_STYLE = {
  background: "#f8fafc",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.08)",
  color: "#111827",
  fontSize: 15,
  fontWeight: 600,
  outline: "none",
  padding: "9px 10px",
  width: "100%"
};
const TOAST_STYLE = {
  background: "#111827",
  borderLeft: "4px solid #f59e0b",
  borderRadius: 6,
  bottom: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,.25)",
  color: "white",
  fontSize: 14,
  fontWeight: 600,
  left: "50%",
  maxWidth: "calc(100vw - 32px)",
  padding: "12px 16px",
  position: "absolute",
  transform: "translateX(-50%)",
  zIndex: 3000
};

function getAircraftKey(ac) {
  return (
    ac.hex ||
    ac.r ||
    (ac.flight || "").trim() ||
    `${ac.lat}-${ac.lon}`
  );
}

function getFirstAircraft(data) {
  if (!data || !Array.isArray(data.ac)) {
    return null;
  }

  return data.ac[0] || null;
}

function DetailRow({ label, value, suffix = "" }) {
  const hasValue = value !== undefined && value !== null && value !== "";

  return (
    <div>
      <b>{label}:</b>{" "}
      {hasValue ? `${value}${suffix}` : "-"}
    </div>
  );
}

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
        class="aircraft-icon"
        style="color:${color};"
      >
        <span
          class="aircraft-icon__plane"
          style="transform:rotate(${(ac.track || 0) - 90}deg);"
        >
          &#9992;
        </span>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function AnimatedAircraftMarker({ ac, onClick }) {
  const markerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const displayPositionRef = useRef([
    ac.lat,
    ac.lon
  ]);
  const [displayPosition, setDisplayPosition] = useState([
    ac.lat,
    ac.lon
  ]);
  const icon = useMemo(
    () => createAircraftIcon(ac),
    [ac.alt_baro, ac.track]
  );

  function handleMarkerClick(event) {
    onClick?.();

    window.requestAnimationFrame(() => {
      event.target.openPopup();
      markerRef.current?.openPopup();
    });
  }

  useEffect(() => {
    const startedAt = performance.now();
    const startPosition = displayPositionRef.current;
    const nextPosition = [ac.lat, ac.lon];

    window.cancelAnimationFrame(animationFrameRef.current);

    const animate = (now) => {
      const progress = Math.min(
        (now - startedAt) / MARKER_ANIMATION_MS,
        1
      );
      const currentPosition = [
        startPosition[0] +
          (nextPosition[0] - startPosition[0]) * progress,
        startPosition[1] +
          (nextPosition[1] - startPosition[1]) * progress
      ];

      displayPositionRef.current = currentPosition;
      setDisplayPosition(currentPosition);

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        displayPositionRef.current = nextPosition;
        setDisplayPosition(nextPosition);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, [ac.lat, ac.lon]);

  return (
    <Marker
      ref={markerRef}
      position={displayPosition}
      icon={icon}
      eventHandlers={{
        click: handleMarkerClick
      }}
    >
      <Popup>
        <div style={{ minWidth: 160 }}>
          <b>
            {ac.flight ||
              "Unknown"}
          </b>
          <br />
          Type: {ac.t || "-"}
          <br />
          Altitude: {ac.alt_baro || "-"} ft
          <br />
          Speed: {ac.gs || "-"} kt
          <br />
          Heading: {ac.track || "-"}°
          <br />
          ICAO: {ac.hex || "-"}
        </div>
      </Popup>
    </Marker>
  );
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    }
  });

  return null;
}

function MapRefHandler({ mapRef }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

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
  const [aircraftDetails, setAircraftDetails] = useState({});

  const [expandedFlight, setExpandedFlight] = useState(null);

  const [locationInfo, setLocationInfo] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  const mapRef = useRef();
  const toastTimerRef = useRef(null);

  function showToast(message) {
    setToastMessage(message);
    window.clearTimeout(toastTimerRef.current);

    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
    }, 4000);
  }

  function locateAircraft(ac) {
    const lat = Number(ac.lat);
    const lon = Number(ac.lon);

    if (!mapRef.current || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    mapRef.current.flyTo(
      [lat, lon],
      11,
      {
        animate: true,
        duration: 0.8
      }
    );
  }

  async function fetchAircraftLookup(path) {
    const response = await fetch(
      `https://api.airplanes.live/v2/${path}`
    );

    if (response.status === 429) {
      showToast("Too many requests. Please wait for some time.");
      return null;
    }

    if (!response.ok) {
      throw new Error(`Flight lookup error: ${response.status}`);
    }

    const data = await response.json();
    return getFirstAircraft(data);
  }

  async function fetchAircraftDetails(ac) {
    const aircraftKey = getAircraftKey(ac);

    if (aircraftDetails[aircraftKey]?.status === "loading") {
      return;
    }

    setAircraftDetails((current) => ({
      ...current,
      [aircraftKey]: {
        ...current[aircraftKey],
        status: "loading"
      }
    }));

    try {
      const registration = (ac.r || "").trim();
      const callsign = (ac.flight || "").trim();
      const [regDetails, callsignDetails] = await Promise.all([
        registration
          ? fetchAircraftLookup(`reg/${encodeURIComponent(registration)}`)
          : Promise.resolve(null),
        callsign
          ? fetchAircraftLookup(`callsign/${encodeURIComponent(callsign)}`)
          : Promise.resolve(null)
      ]);

      setAircraftDetails((current) => ({
        ...current,
        [aircraftKey]: {
          reg: regDetails,
          callsign: callsignDetails,
          status: "loaded"
        }
      }));
    } catch (err) {
      console.error("Flight details error:", err);
      setAircraftDetails((current) => ({
        ...current,
        [aircraftKey]: {
          ...current[aircraftKey],
          error: "Unable to load more details.",
          status: "error"
        }
      }));
    }
  }

  const fetchFlights = async (lat, lng, radiusNm) => {
    try {
      const url =
        `https://api.airplanes.live/v2/point/${lat}/${lng}/${radiusNm}`;

      const response = await fetch(url);

      if (response.status === 429) {
        showToast("Too many requests. Please wait for some time.");
        return;
      }

      if (!response.ok) {
        throw new Error(`Flight API error: ${response.status}`);
      }

      const data = await response.json();

      setAircraft(data.ac || []);
    } catch (err) {
      console.error("Flight API error:", err);
    }
  };

  function toggleFlight(ac) {
  const aircraftKey = getAircraftKey(ac);

  setExpandedFlight(prev =>
    prev === aircraftKey ? null : aircraftKey
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
      console.log("Refreshing flight data...");
      fetchFlights(
        center.lat,
        center.lng,
        radius
      );
    }, REFRESH_INTERVAL);

    return () => clearInterval(timer);
  }, [center, radius]);

  useEffect(() => {
    if (!expandedFlight) {
      return;
    }

    const selectedAircraft = aircraft.find(
      (ac) => getAircraftKey(ac) === expandedFlight
    );

    if (!selectedAircraft || aircraftDetails[expandedFlight]) {
      return;
    }

    fetchAircraftDetails(selectedAircraft);
  }, [expandedFlight, aircraft, aircraftDetails]);

  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        position: "relative"
      }}
    >
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={TOAST_STYLE}
        >
          {toastMessage}
        </div>
      )}

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
            bottom: 10,
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
              style={PRIMARY_BUTTON_STYLE}
            >
              Use My Location
            </button>
          </div>

          <div
            style={{
              marginTop: 10
            }}
          >
            <label
              htmlFor="radius-input"
              style={FIELD_LABEL_STYLE}
            >
              Radius (NM)
            </label>
            <input
              id="radius-input"
              type="number"
              value={radius}
              onChange={(e) =>
                setRadius(
                  Math.min(
                    Number(e.target.value),
                    MAX_RADIUS_NM
                  )
                )
              }
              min="1"
              max={MAX_RADIUS_NM}
              style={RADIUS_INPUT_STYLE}
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
        >
          <MapRefHandler mapRef={mapRef} />

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
              <AnimatedAircraftMarker
                key={
                  ac.hex ||
                  `${ac.lat}-${ac.lon}`
                }
                ac={ac}
                onClick={() => {
                  setExpandedFlight(getAircraftKey(ac));
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      <div
  style={{
  width: "min(400px, 90vw)",
  borderLeft: "1px solid #ddd",
  overflowY: "auto",
  background: "#fafafa",
  boxShadow: sidebarOpen
    ? "-2px 0 12px rgba(0,0,0,.18)"
    : "none",
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  zIndex: 1500,
  pointerEvents: sidebarOpen
    ? "auto"
    : "none",
  transform:
    sidebarOpen
      ? "translateX(0)"
      : "translateX(calc(100% + 12px))",

  transition:
    "transform 0.3s ease, box-shadow 0.3s ease"
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

      const aircraftKey =
        getAircraftKey(ac);
      const expanded =
        expandedFlight === aircraftKey;
      const detail =
        aircraftDetails[aircraftKey];
      const detailAircraft = {
        ...ac,
        ...(detail?.reg || {}),
        ...(detail?.callsign || {})
      };

      return (
        <div
          key={aircraftKey}
          style={{
            borderBottom:
              "1px solid #e5e5e5"
          }}
        >
          <div
            onClick={() =>
              toggleFlight(ac)
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
              <DetailRow
                label="ICAO"
                value={detailAircraft.hex}
              />

              <DetailRow
                label="Registration"
                value={detailAircraft.r}
              />

              <DetailRow
                label="Callsign"
                value={detailAircraft.flight}
              />

              <DetailRow
                label="Type"
                value={detailAircraft.t}
              />

              <DetailRow
                label="Description"
                value={detailAircraft.desc}
              />

              <DetailRow
                label="Operator"
                value={detailAircraft.ownOp}
              />

              <DetailRow
                label="Year"
                value={detailAircraft.year}
              />

              <DetailRow
                label="Category"
                value={detailAircraft.category}
              />

              <DetailRow
                label="Altitude"
                value={detailAircraft.alt_baro}
                suffix=" ft"
              />

              <DetailRow
                label="Speed"
                value={detailAircraft.gs}
                suffix=" kt"
              />

              <DetailRow
                label="Heading"
                value={detailAircraft.track}
                suffix="°"
              />

              <DetailRow
                label="Squawk"
                value={detailAircraft.squawk}
              />

              <DetailRow
                label="Latitude"
                value={detailAircraft.lat}
              />

              <DetailRow
                label="Longitude"
                value={detailAircraft.lon}
              />

              <DetailRow
                label="Emergency"
                value={detailAircraft.emergency || "None"}
              />

              <DetailRow
                label="Messages"
                value={detailAircraft.messages}
              />

              <DetailRow
                label="Last Seen"
                value={detailAircraft.seen}
                suffix="s ago"
              />

              {detail?.status === "loading" && (
                <div
                  style={{
                    color: "#64748b",
                    marginTop: 8
                  }}
                >
                  Loading more details...
                </div>
              )}

              {detail?.status === "error" && (
                <div
                  style={{
                    color: "#b91c1c",
                    marginTop: 8
                  }}
                >
                  {detail.error}
                </div>
              )}

              <button
                style={{
                  ...PRIMARY_BUTTON_STYLE,
                  marginTop: 10
                }}
                onClick={() => {
                  locateAircraft(ac);
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
