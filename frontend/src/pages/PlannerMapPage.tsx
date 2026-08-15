import {
  useEffect,
  useRef,
  useState,
} from "react";

import mapboxgl from "mapbox-gl";

import type {
  Feature,
  LineString,
} from "geojson";

import {
  ArrowLeft,
  Clock3,
  MapPin,
  Navigation,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  generateTrip,
} from "../services/api";

import type {
  TripDay,
  TripPlan,
  TripStop,
} from "../types/trip";

import "mapbox-gl/dist/mapbox-gl.css";
import "./PlannerMapPage.css";


// =========================================================
// Constants
// =========================================================

const TORONTO_CENTER: [number, number] = [
  -79.3832,
  43.6532,
];

const loadingMessages = [
  "Understanding your trip",
  "Choosing great places",
  "Building a practical route",
  "Polishing your itinerary",
];


// =========================================================
// Types used only by this page
// =========================================================

type MarkerRecord = {
  stopId: string;
  marker: mapboxgl.Marker;
  element: HTMLDivElement;
};


// =========================================================
// Page
// =========================================================

function PlannerMapPage() {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const mapContainerRef =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<mapboxgl.Map | null>(null);

  const markersRef =
    useRef<MarkerRecord[]>([]);

  const animationFrameRef =
    useRef<number | null>(null);


  // -------------------------------------------------------
  // URL parameters
  // -------------------------------------------------------

  const city =
    searchParams.get("city") ||
    "Toronto";

  const days = Math.min(
    Math.max(
      Number(
        searchParams.get("days") ||
          "1",
      ),
      1,
    ),
    3,
  );

  const interests =
    searchParams.get("interests") ||
    "food, architecture, culture, local experiences";

  const pace = (
    searchParams.get("pace") ||
    "balanced"
  ) as
    | "relaxed"
    | "balanced"
    | "fast";


  // -------------------------------------------------------
  // State
  // -------------------------------------------------------

  const [
    mapReady,
    setMapReady,
  ] = useState(false);

  const [
    trip,
    setTrip,
  ] = useState<TripPlan | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    loadingPhase,
    setLoadingPhase,
  ] = useState(0);

  const [
    activeDayIndex,
    setActiveDayIndex,
  ] = useState(0);

  const [
    selectedStopId,
    setSelectedStopId,
  ] = useState<string | null>(
    null,
  );


  // =======================================================
  // Cache
  // =======================================================

  const cacheKey = [
    "easychina-trip",
    city,
    days,
    interests,
    pace,
  ].join("|");


  // =======================================================
  // Initialize Mapbox
  // =======================================================

  useEffect(() => {
    const token =
      import.meta.env
        .VITE_MAPBOX_TOKEN;

    if (!token) {
      setError(
        "VITE_MAPBOX_TOKEN is missing.",
      );

      setLoading(false);

      return;
    }

    if (!mapContainerRef.current) {
      return;
    }

    mapboxgl.accessToken = token;

    const map =
      new mapboxgl.Map({
        container:
          mapContainerRef.current,

        style:
          "mapbox://styles/mapbox/streets-v12",

        center:
          TORONTO_CENTER,

        zoom: 11.2,

        pitch: 32,

        bearing: -6,

        antialias: true,
      });

    map.addControl(
      new mapboxgl.NavigationControl({
        showZoom: true,
        showCompass: true,
      }),
      "top-right",
    );

    map.on("load", () => {
      setMapReady(true);
    });

    map.on(
      "error",
      (event) => {
        console.error(
          "Mapbox error:",
          event.error,
        );
      },
    );

    mapRef.current = map;


    return () => {
      if (
        animationFrameRef.current !==
        null
      ) {
        cancelAnimationFrame(
          animationFrameRef.current,
        );
      }

      removeMarkers();

      map.remove();

      mapRef.current = null;
    };
  }, []);


  // =======================================================
  // Load AI itinerary
  // =======================================================

  useEffect(() => {
    loadTrip();
    // Intentionally run from URL parameters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    city,
    days,
    interests,
    pace,
  ]);


  async function loadTrip(
    force = false,
  ) {
    setLoading(true);
    setError(null);
    setLoadingPhase(0);
    setActiveDayIndex(0);

    try {
      // -----------------------------------------------
      // Check local cache first
      // -----------------------------------------------

      if (!force) {
        const cached =
          sessionStorage.getItem(
            cacheKey,
          );

        if (cached) {
          const parsed =
            JSON.parse(
              cached,
            ) as TripPlan;

          setTrip(parsed);

          const firstStop =
            parsed.days[0]
              ?.stops[0];

          if (firstStop) {
            setSelectedStopId(
              firstStop.id,
            );
          }

          setLoading(false);

          return;
        }
      }


      // -----------------------------------------------
      // Call FastAPI
      // -----------------------------------------------

      const result =
        await generateTrip({
          city,
          days,
          interests,
          pace,
        });

      setTrip(result);

      sessionStorage.setItem(
        cacheKey,
        JSON.stringify(
          result,
        ),
      );

      const firstStop =
        result.days[0]
          ?.stops[0];

      if (firstStop) {
        setSelectedStopId(
          firstStop.id,
        );
      }
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate itinerary.",
      );
    } finally {
      setLoading(false);
    }
  }


  // =======================================================
  // Loading text animation
  // =======================================================

  useEffect(() => {
    if (!loading) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          setLoadingPhase(
            (current) =>
              Math.min(
                current + 1,
                loadingMessages.length -
                  1,
              ),
          );
        },
        1400,
      );

    return () =>
      window.clearInterval(
        timer,
      );
  }, [loading]);


  // =======================================================
  // Draw selected day
  // =======================================================

  useEffect(() => {
    if (
      !mapReady ||
      !trip ||
      !mapRef.current
    ) {
      return;
    }

    const day =
      trip.days[
        activeDayIndex
      ];

    if (!day) {
      return;
    }

    drawDay(
      mapRef.current,
      day,
    );
  }, [
    mapReady,
    trip,
    activeDayIndex,
  ]);


  // =======================================================
  // Update selected marker styling
  // =======================================================

  useEffect(() => {
    markersRef.current.forEach(
      ({
        stopId,
        element,
      }) => {
        element.classList.toggle(
          "easychina-map-marker-active",
          stopId ===
            selectedStopId,
        );
      },
    );
  }, [selectedStopId]);


  // =======================================================
  // Draw day
  // =======================================================

  function drawDay(
    map: mapboxgl.Map,
    day: TripDay,
  ) {
    clearExistingMapContent(
      map,
    );

    const stops = day.stops;

    if (!stops.length) {
      return;
    }


    // -----------------------------------------------------
    // Markers
    // -----------------------------------------------------

    stops.forEach(
      (stop, index) => {
        const marker =
          createStopMarker(
            stop,
            index,
            map,
          );

        markersRef.current.push(
          marker,
        );
      },
    );


    // -----------------------------------------------------
    // Fit map to all stops
    // -----------------------------------------------------

    const bounds =
      new mapboxgl.LngLatBounds();

    stops.forEach((stop) => {
      bounds.extend(
        stop.coordinates,
      );
    });

    map.fitBounds(bounds, {
      padding: {
        top: 125,

        right: 90,

        bottom:
          window.innerWidth <= 850
            ? 390
            : 120,

        left:
          window.innerWidth > 850
            ? 430
            : 70,
      },

      maxZoom: 14,

      duration: 1100,

      essential: true,
    });


    // -----------------------------------------------------
    // Route
    // -----------------------------------------------------

    const routeCoordinates =
      day.route?.geometry;

    if (
      !routeCoordinates ||
      routeCoordinates.length < 2
    ) {
      return;
    }

    drawAnimatedRoute(
      map,
      routeCoordinates,
    );
  }


  // =======================================================
  // Marker
  // =======================================================

  function createStopMarker(
    stop: TripStop,
    index: number,
    map: mapboxgl.Map,
  ): MarkerRecord {
    const element =
      document.createElement(
        "div",
      );

    element.className =
      "easychina-map-marker";

    element.style.animationDelay =
      `${index * 80}ms`;

    element.innerHTML = `
      <div class="marker-dot">
        ${index + 1}
      </div>

      <div class="marker-label">
        ${escapeHtml(stop.name)}
      </div>
    `;


    // -----------------------------------------------------
    // Popup
    // -----------------------------------------------------

    const popup =
      new mapboxgl.Popup({
        offset: 31,

        closeButton: false,

        closeOnClick: true,

        className:
          "easychina-popup",
      }).setHTML(`
        <div class="popup-content">

          <span class="popup-stop-number">
            STOP ${index + 1}
          </span>

          <strong>
            ${escapeHtml(
              stop.name,
            )}
          </strong>

          <p>
            ${escapeHtml(
              stop.reason,
            )}
          </p>

          <div class="popup-meta">
            ${escapeHtml(
              stop.time,
            )}
            ·
            ${stop.duration_minutes}
            min
          </div>

        </div>
      `);


    // -----------------------------------------------------
    // Marker click
    // -----------------------------------------------------

    element.addEventListener(
      "click",
      () => {
        selectStop(stop);
      },
    );


    // -----------------------------------------------------
    // Create actual Mapbox marker
    // -----------------------------------------------------

    const marker =
      new mapboxgl.Marker({
        element,

        anchor: "center",
      })
        .setLngLat(
          stop.coordinates,
        )
        .setPopup(popup)
        .addTo(map);


    return {
      stopId: stop.id,
      marker,
      element,
    };
  }


  // =======================================================
  // Route
  // =======================================================

  function drawAnimatedRoute(
    map: mapboxgl.Map,
    coordinates:
      [number, number][],
  ) {
    const sampled =
      sampleRoute(
        coordinates,
        420,
      );

    if (sampled.length < 2) {
      return;
    }


    // -----------------------------------------------------
    // Begin route with two identical points
    // -----------------------------------------------------

    const initialFeature:
      Feature<LineString> = {
      type: "Feature",

      properties: {},

      geometry: {
        type: "LineString",

        coordinates: [
          sampled[0],
          sampled[0],
        ],
      },
    };


    // -----------------------------------------------------
    // Source
    // -----------------------------------------------------

    map.addSource(
      "easychina-route",
      {
        type: "geojson",

        data: initialFeature,
      },
    );


    // -----------------------------------------------------
    // Big white border
    // -----------------------------------------------------

    map.addLayer({
      id:
        "easychina-route-shadow",

      type: "line",

      source:
        "easychina-route",

      layout: {
        "line-cap":
          "round",

        "line-join":
          "round",
      },

      paint: {
        "line-color":
          "#ffffff",

        "line-width": 12,

        "line-opacity":
          0.95,

        "line-blur":
          0.8,
      },
    });


    // -----------------------------------------------------
    // Main green route
    // -----------------------------------------------------

    map.addLayer({
      id:
        "easychina-route",

      type: "line",

      source:
        "easychina-route",

      layout: {
        "line-cap":
          "round",

        "line-join":
          "round",
      },

      paint: {
        "line-color":
          "#18A567",

        "line-width": 6,

        "line-opacity":
          0.98,
      },
    });


    // -----------------------------------------------------
    // Animate
    // -----------------------------------------------------

    animateRoute(
      map,
      sampled,
    );
  }


  function animateRoute(
    map: mapboxgl.Map,
    coordinates:
      [number, number][],
  ) {
    const rawSource =
      map.getSource(
        "easychina-route",
      );

    if (!rawSource) {
      return;
    }

    const source =
      rawSource as
        mapboxgl.GeoJSONSource;

    const start =
      performance.now();

    const duration = 1250;


    function frame(
      now: number,
    ) {
      const progress =
        Math.min(
          (now - start) /
            duration,
          1,
        );


      // Smooth ease-out
      const eased =
        1 -
        Math.pow(
          1 - progress,
          3,
        );


      const endIndex =
        Math.max(
          2,

          Math.floor(
            eased *
              coordinates.length,
          ),
        );


      const visible =
        coordinates.slice(
          0,
          endIndex,
        );


      const feature:
        Feature<LineString> = {
        type: "Feature",

        properties: {},

        geometry: {
          type:
            "LineString",

          coordinates:
            visible,
        },
      };


      source.setData(
        feature,
      );


      if (progress < 1) {
        animationFrameRef.current =
          requestAnimationFrame(
            frame,
          );
      } else {
        animationFrameRef.current =
          null;
      }
    }


    animationFrameRef.current =
      requestAnimationFrame(
        frame,
      );
  }


  // =======================================================
  // Remove old route + markers
  // =======================================================

  function clearExistingMapContent(
    map: mapboxgl.Map,
  ) {
    if (
      animationFrameRef.current !==
      null
    ) {
      cancelAnimationFrame(
        animationFrameRef.current,
      );

      animationFrameRef.current =
        null;
    }


    removeMarkers();


    if (
      map.getLayer(
        "easychina-route",
      )
    ) {
      map.removeLayer(
        "easychina-route",
      );
    }


    if (
      map.getLayer(
        "easychina-route-shadow",
      )
    ) {
      map.removeLayer(
        "easychina-route-shadow",
      );
    }


    if (
      map.getSource(
        "easychina-route",
      )
    ) {
      map.removeSource(
        "easychina-route",
      );
    }
  }


  function removeMarkers() {
    markersRef.current.forEach(
      ({ marker }) => {
        marker.remove();
      },
    );

    markersRef.current = [];
  }


  // =======================================================
  // Stop selection
  // =======================================================

  function selectStop(
    stop: TripStop,
  ) {
    setSelectedStopId(
      stop.id,
    );

    const map =
      mapRef.current;

    if (!map) {
      return;
    }

    map.flyTo({
      center:
        stop.coordinates,

      zoom: 15.4,

      pitch: 48,

      bearing: -5,

      duration: 850,

      essential: true,
    });
  }


  // =======================================================
  // Day switching
  // =======================================================

  function switchDay(
    index: number,
  ) {
    setActiveDayIndex(
      index,
    );

    const firstStop =
      trip?.days[index]
        ?.stops[0];

    if (firstStop) {
      setSelectedStopId(
        firstStop.id,
      );
    }
  }


  // =======================================================
  // New plan
  // =======================================================

  function newTrip() {
    navigate("/");
  }


  function regenerateTrip() {
    sessionStorage.removeItem(
      cacheKey,
    );

    loadTrip(true);
  }


  // =======================================================
  // Helpers
  // =======================================================

  const activeDay =
    trip?.days[
      activeDayIndex
    ];


  const distanceText =
    activeDay?.route
      ? `${(
          activeDay.route
            .distance_meters /
          1000
        ).toFixed(1)} km`
      : "—";


  const durationText =
    activeDay?.route
      ? formatDuration(
          activeDay.route
            .duration_seconds,
        )
      : "—";


  // =======================================================
  // UI
  // =======================================================

  return (
    <div className="planner-page">

      {/* =============================================== */}
      {/* MAP */}
      {/* =============================================== */}

      <div
        ref={
          mapContainerRef
        }
        className="planner-map"
      />


      {/* =============================================== */}
      {/* TOP NAV */}
      {/* =============================================== */}

      <header className="planner-nav">

        <button
          className="nav-icon-button"
          onClick={() =>
            navigate("/")
          }
          aria-label="Back"
        >
          <ArrowLeft
            size={19}
          />
        </button>


        <div className="planner-nav-title">

          <strong>
            {trip?.city ||
              city}
          </strong>

          <span>
            AI itinerary
          </span>

        </div>


        <button
          className="new-plan-button"
          onClick={newTrip}
        >
          <RotateCcw
            size={15}
          />

          New trip
        </button>

      </header>


      {/* =============================================== */}
      {/* LOADING */}
      {/* =============================================== */}

      {loading && (

        <div className="planning-overlay">

          <div className="planning-card">

            <div className="planning-orb">

              <Sparkles
                size={27}
              />

            </div>


            <span className="planning-label">
              EASYCHINA AI
            </span>


            <h1>
              Planning {city}
            </h1>


            <p>
              {
                loadingMessages[
                  loadingPhase
                ]
              }

              <span className="loading-dots">
                ...
              </span>
            </p>


            <div className="planning-progress">

              <span
                style={{
                  width:
                    `${
                      ((loadingPhase +
                        1) /
                        loadingMessages.length) *
                      100
                    }%`,
                }}
              />

            </div>

          </div>

        </div>

      )}


      {/* =============================================== */}
      {/* ERROR */}
      {/* =============================================== */}

      {!loading &&
        error && (

          <div className="planner-error">

            <Sparkles
              size={25}
            />

            <h2>
              Couldn't build
              this trip.
            </h2>

            <p>
              {error}
            </p>

            <button
              onClick={() =>
                loadTrip(true)
              }
            >
              Try again
            </button>

          </div>

        )}


      {/* =============================================== */}
      {/* ITINERARY PANEL */}
      {/* =============================================== */}

      {!loading &&
        trip &&
        activeDay && (

          <aside className="itinerary-panel">

            {/* Header */}

            <div className="itinerary-header">

              <div className="ai-badge">

                <Sparkles
                  size={13}
                />

                AI PLANNED

              </div>


              <h1>
                {trip.title}
              </h1>


              <p>
                {trip.summary}
              </p>

            </div>


            {/* Day tabs */}

            {trip.days.length >
              1 && (

              <div className="day-tabs">

                {trip.days.map(
                  (
                    day,
                    index,
                  ) => (

                    <button
                      key={
                        day.day
                      }
                      className={
                        activeDayIndex ===
                        index
                          ? "day-tab day-tab-active"
                          : "day-tab"
                      }
                      onClick={() =>
                        switchDay(
                          index,
                        )
                      }
                    >

                      Day {day.day}

                    </button>

                  ),
                )}

              </div>

            )}


            {/* Theme */}

            <div className="day-theme">
              {activeDay.theme}
            </div>


            {/* Summary */}

            <div className="route-summary">

              <div>

                <Navigation
                  size={16}
                />

                <span>
                  {distanceText}
                </span>

              </div>


              <div>

                <Clock3
                  size={16}
                />

                <span>
                  {durationText}
                </span>

              </div>


              <div>

                <MapPin
                  size={16}
                />

                <span>
                  {
                    activeDay
                      .stops
                      .length
                  }{" "}
                  stops
                </span>

              </div>

            </div>


            {/* Stops */}

            <div className="stop-list">

              {activeDay.stops.map(
                (
                  stop,
                  index,
                ) => {

                  const active =
                    selectedStopId ===
                    stop.id;

                  return (

                    <button
                      key={
                        stop.id
                      }
                      className={
                        active
                          ? "stop-card stop-card-active"
                          : "stop-card"
                      }
                      onClick={() =>
                        selectStop(
                          stop,
                        )
                      }
                    >

                      <div className="stop-number">
                        {index + 1}
                      </div>


                      <div className="stop-info">

                        <div className="stop-meta">

                          <span>
                            {
                              stop.time
                            }
                          </span>

                          <span>
                            {
                              stop.duration_minutes
                            }{" "}
                            min
                          </span>

                        </div>


                        <h3>
                          {
                            stop.name
                          }
                        </h3>


                        <p>
                          {
                            stop.reason
                          }
                        </p>

                      </div>

                    </button>

                  );
                },
              )}

            </div>


            {/* Regenerate */}

            <button
              className="regenerate-button"
              onClick={
                regenerateTrip
              }
            >

              <RotateCcw
                size={14}
              />

              Generate another route

            </button>

          </aside>

        )}

    </div>
  );
}


// =========================================================
// Route sampling
// =========================================================

function sampleRoute(
  coordinates:
    [number, number][],
  maximumPoints: number,
) {
  if (
    coordinates.length <=
    maximumPoints
  ) {
    return coordinates;
  }


  const step =
    Math.ceil(
      coordinates.length /
        maximumPoints,
    );


  const sampled =
    coordinates.filter(
      (_, index) =>
        index % step === 0,
    );


  const last =
    coordinates[
      coordinates.length - 1
    ];


  const finalSample =
    sampled[
      sampled.length - 1
    ];


  if (
    finalSample[0] !== last[0] ||
    finalSample[1] !== last[1]
  ) {
    sampled.push(last);
  }


  return sampled;
}


// =========================================================
// Duration formatting
// =========================================================

function formatDuration(
  seconds: number,
) {
  const minutes =
    Math.round(
      seconds / 60,
    );


  if (minutes < 60) {
    return `${minutes} min`;
  }


  const hours =
    Math.floor(
      minutes / 60,
    );


  const remaining =
    minutes % 60;


  if (remaining === 0) {
    return `${hours} hr`;
  }


  return `${hours} hr ${remaining} min`;
}


// =========================================================
// Escape AI text before inserting into Popup HTML
// =========================================================

function escapeHtml(
  value: string,
) {
  return value
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
}


export default PlannerMapPage;