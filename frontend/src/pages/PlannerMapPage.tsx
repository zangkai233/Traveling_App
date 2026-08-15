import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import mapboxgl from "mapbox-gl";

import type {
  Feature,
  LineString,
} from "geojson";

import {
  ArrowLeft,
  ChevronUp,
  Clock3,
  LocateFixed,
  MapPin,
  Navigation,
  Play,
  Plus,
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
  Coordinates,
  TripDay,
  TripLanguage,
  TripPlan,
  TripStop,
} from "../types/trip";

import "mapbox-gl/dist/mapbox-gl.css";
import "./PlannerMapPage.css";


type MarkerRecord = {
  stopId: string;
  marker: mapboxgl.Marker;
  element: HTMLDivElement;
};


const loadingMessages = [
  "Understanding your trip",
  "Choosing memorable places",
  "Organizing nearby stops",
  "Building your route",
];


const mapCopy = {
  English: {
    aiTrip: "AI-OPTIMIZED ROUTE",
    replay: "Recenter",
    day: "Day",
    days: "days",
    stops: "stops",
    addStop: "Add stop",
    replan: "Replan",
    placeholder: "e.g. Summer Palace",
    include: "Include & rebuild",
    cancel: "Cancel",
    toNext: "to next",
  },
  "简体中文": {
    aiTrip: "AI 优化路线",
    replay: "重新居中",
    day: "第",
    days: "天",
    stops: "个地点",
    addStop: "添加地点",
    replan: "重新规划",
    placeholder: "例如：颐和园",
    include: "加入并重建路线",
    cancel: "取消",
    toNext: "到下一站",
  },
  Français: {
    aiTrip: "ITINÉRAIRE OPTIMISÉ PAR IA",
    replay: "Recentrer",
    day: "Jour",
    days: "jours",
    stops: "étapes",
    addStop: "Ajouter une étape",
    replan: "Replanifier",
    placeholder: "p. ex. Palais d'Été",
    include: "Ajouter et recalculer",
    cancel: "Annuler",
    toNext: "jusqu’à la suite",
  },
} as const;


function PlannerMapPage() {
  const navigate =
    useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();


  const mapContainerRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const mapRef =
    useRef<mapboxgl.Map | null>(
      null,
    );

  const markersRef =
    useRef<MarkerRecord[]>([]);

  const animationTimersRef =
    useRef<number[]>([]);

  const tripRequestRef =
    useRef<AbortController | null>(
      null,
    );


  const requestedCity =
    searchParams.get(
      "city",
    )?.trim();

  const city =
    requestedCity || "Beijing";

  const savedLanguage =
    localStorage.getItem(
      "easychina.language",
    );

  const language:
    TripLanguage =
    savedLanguage === "简体中文" ||
    savedLanguage === "Français"
      ? savedLanguage
      : "English";

  const copy =
    mapCopy[language];

  const units =
    localStorage.getItem(
      "easychina.units",
    ) || "Metric";

  const animationsEnabled =
    localStorage.getItem(
      "easychina.animations",
    ) !== "false";

  const mapboxToken =
    import.meta.env
      .VITE_MAPBOX_TOKEN;


  const days =
    Math.min(
      Math.max(
        Number(
          searchParams.get(
            "days",
          ) || "1",
        ),
        1,
      ),
      3,
    );


  const interests =
    searchParams.get(
      "interests",
    ) ||
    "Food, Culture";


  const pace =
    (
      searchParams.get(
        "pace",
      ) ||
      localStorage.getItem(
        "easychina.pace",
      ) ||
      "balanced"
    ) as
      | "relaxed"
      | "balanced"
      | "fast";


  const mustVisit =
    (
      searchParams.get(
        "must_visit",
      ) || ""
    )
      .split(",")
      .map(
        (value) =>
          value.trim(),
      )
      .filter(Boolean);


  const surprise =
    searchParams.get(
      "surprise",
    ) === "1";


  const [
    mapReady,
    setMapReady,
  ] =
    useState(false);


  const [
    trip,
    setTrip,
  ] =
    useState<TripPlan | null>(
      null,
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      Boolean(mapboxToken),
    );


  const [
    error,
    setError,
  ] =
    useState<string | null>(
      mapboxToken
        ? null
        : (
            "VITE_MAPBOX_TOKEN "
            + "is missing."
          ),
    );


  const [
    loadingPhase,
    setLoadingPhase,
  ] =
    useState(0);


  const [
    activeDayIndex,
    setActiveDayIndex,
  ] =
    useState(0);


  const [
    selectedStopId,
    setSelectedStopId,
  ] =
    useState<string | null>(
      null,
    );


  const [
    sheetExpanded,
    setSheetExpanded,
  ] =
    useState(false);

  const [
    addStopOpen,
    setAddStopOpen,
  ] = useState(false);

  const [
    newStopName,
    setNewStopName,
  ] = useState("");


  const cacheKey =
    [
      "easychina-trip-v4",
      city,
      days,
      interests,
      pace,
      mustVisit.join(","),
      surprise,
      language,
    ].join("|");


  function removeMarkers() {
    markersRef.current.forEach(
      ({
        marker,
      }) =>
        marker.remove(),
    );

    markersRef.current = [];
  }


  function clearAnimationTimers() {
    animationTimersRef.current.forEach(
      (timer) =>
        window.clearTimeout(
          timer,
        ),
    );

    animationTimersRef.current = [];
  }


  function clearMapVisualization(
    map: mapboxgl.Map,
  ) {
    clearAnimationTimers();
    removeMarkers();

    if (
      map.getLayer(
        "easychina-route-line",
      )
    ) {
      map.removeLayer(
        "easychina-route-line",
      );
    }

    if (
      map.getLayer(
        "easychina-route-halo",
      )
    ) {
      map.removeLayer(
        "easychina-route-halo",
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


  /* ======================================================
     MAP
     ====================================================== */

  useEffect(() => {
    const token =
      mapboxToken;


    if (!token) {
      return;
    }


    if (
      !mapContainerRef.current
    ) {
      return;
    }


    mapboxgl.accessToken =
      token;


    const map =
      new mapboxgl.Map({
        container:
          mapContainerRef.current,

        style:
          "mapbox://styles/mapbox/standard",

        center: [0, 25],

        zoom: 1.5,

        pitch: 0,

        bearing: 0,

        antialias: true,
      });


    map.on(
      "load",
      () => {
        setMapReady(
          true,
        );
      },
    );


    map.on(
      "error",
      (event) => {
        console.error(
          "Mapbox:",
          event.error,
        );
      },
    );


    mapRef.current =
      map;


    return () => {
      tripRequestRef.current
        ?.abort();

      clearAnimationTimers();

      removeMarkers();

      map.remove();

      mapRef.current =
        null;
    };
  }, [mapboxToken]);


  /* ======================================================
     LOAD TRIP
     ====================================================== */

  async function loadTrip(
    force = false,
  ) {
    tripRequestRef.current
      ?.abort();

    const controller =
      new AbortController();

    tripRequestRef.current =
      controller;

    setLoading(true);

    setError(null);

    setTrip(null);

    setLoadingPhase(0);

    setActiveDayIndex(0);

    setSheetExpanded(false);

    setAddStopOpen(false);

    if (
      mapRef.current
    ) {
      if (
        mapRef.current
          .isStyleLoaded()
      ) {
        clearMapVisualization(
          mapRef.current,
        );
      } else {
        clearAnimationTimers();

        removeMarkers();
      }
    }


    try {
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


          setTrip(
            parsed,
          );


          const first =
            parsed.days[0]
              ?.stops[0];


          if (first) {
            setSelectedStopId(
              first.id,
            );
          }


          setLoading(false);

          tripRequestRef.current =
            null;

          return;
        }
      }


      const result =
        await generateTrip({
          city,
          days,
          interests,
          pace,
          must_visit:
            mustVisit,
          surprise_me:
            surprise,
          language,
        }, controller.signal);


      if (
        controller.signal.aborted
      ) {
        return;
      }


      setTrip(
        result,
      );


      sessionStorage.setItem(
        cacheKey,
        JSON.stringify(
          result,
        ),
      );


      const first =
        result.days[0]
          ?.stops[0];


      if (first) {
        setSelectedStopId(
          first.id,
        );
      }

    } catch (err) {

      if (
        controller.signal.aborted
      ) {
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : (
              "Unable to "
              + "generate trip."
            ),
      );

    } finally {

      if (
        tripRequestRef.current ===
        controller
      ) {
        setLoading(false);

        tripRequestRef.current =
          null;
      }

    }
  }


  useEffect(() => {
    if (!mapboxToken) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          void loadTrip();
        },
        0,
      );

    return () =>
      window.clearTimeout(
        timer,
      );

    // URL controls the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, mapboxToken]);


  /* ======================================================
     LOADING MESSAGES
     ====================================================== */

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
        1350,
      );


    return () =>
      window.clearInterval(
        timer,
      );

  }, [loading]);


  /* ======================================================
     ACTIVE MARKER
     ====================================================== */

  useEffect(() => {
    markersRef.current.forEach(
      ({
        stopId,
        element,
      }) => {

        element.classList.toggle(
          "route-marker-selected",
          stopId ===
            selectedStopId,
        );

      },
    );

  }, [selectedStopId]);


  /* ======================================================
     POINT-BY-POINT VISUALIZATION
     ====================================================== */

  function visualizeDay(
    map: mapboxgl.Map,
    day: TripDay,
  ) {
    clearMapVisualization(
      map,
    );


    if (
      !day.stops.length
    ) {
      return;
    }


    fitDayOnMap(
      map,
      day,
      false,
    );


    /* Create all markers hidden */

    day.stops.forEach(
      (
        stop,
        index,
      ) => {

        const record =
          createMarker(
            stop,
            index,
            map,
          );


        markersRef.current.push(
          record,
        );

      },
    );


    const geometry =
      day.route?.geometry;

    if (
      geometry &&
      geometry.length >= 2
    ) {
      drawRoute(
        map,
        geometry,
      );
    }


    /* Reveal markers after the camera is stable. */

    const markerDelay =
      animationsEnabled
        ? 110
        : 0;


    markersRef.current.forEach(
      (
        record,
        index,
      ) => {

        if (!animationsEnabled) {
          record.element
            .classList.add(
              "route-marker-visible",
            );

          return;
        }

        const timer =
          window.setTimeout(
            () => {

              record.element
                .classList.add(
                  "route-marker-visible",
                );

            },
            90 +
              index *
                markerDelay,
          );


        animationTimersRef
          .current
          .push(timer);

      },
    );


  }


  /* ======================================================
     MARKERS
     ====================================================== */

  function createMarker(
    stop: TripStop,
    index: number,
    map: mapboxgl.Map,
  ): MarkerRecord {

    const element =
      document.createElement(
        "div",
      );


    element.className =
      "route-marker";


    element.innerHTML = `
      <div class="route-marker-visual">
        <div class="route-marker-dot">
          ${index + 1}
        </div>

        <div class="route-marker-name">
          ${escapeHtml(
            stop.name,
          )}
        </div>
      </div>
    `;


    element.addEventListener(
      "click",
      () => {

        selectStop(
          stop,
        );

      },
    );


    const marker =
      new mapboxgl.Marker({
        element,
        anchor: "center",
      })
        .setLngLat(
          stop.coordinates,
        );


    /*
      Desktop can use popup.
      Mobile uses bottom sheet only.
    */

    if (
      window.innerWidth >
      850
    ) {

      const popup =
        new mapboxgl.Popup({
          offset: 28,
          closeButton:
            false,
          className:
            "desktop-stop-popup",
        }).setHTML(`
          <div class="desktop-popup-inner">

            <span>
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

          </div>
        `);


      marker.setPopup(
        popup,
      );
    }


    marker.addTo(
      map,
    );


    return {
      stopId:
        stop.id,

      marker,

      element,
    };
  }


  /* ======================================================
     ROUTE
     ====================================================== */

  function drawRoute(
    map: mapboxgl.Map,
    coordinates: Coordinates[],
  ) {

    if (
      coordinates.length < 2
    ) {
      return;
    }


    const routeFeature:
      Feature<LineString> = {

      type: "Feature",

      properties: {},

      geometry: {
        type:
          "LineString",

        coordinates,
      },
    };


    map.addSource(
      "easychina-route",
      {
        type: "geojson",
        data:
          routeFeature,
        lineMetrics: true,
      },
    );


    /* Soft shadow under a restrained route casing. */

    map.addLayer({
      id:
        "easychina-route-shadow",

      type:
        "line",

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
          "#17335f",

        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          8,
          15,
          14,
        ],

        "line-opacity":
          0.18,

        "line-blur": 5,
      },
    });

    map.addLayer({
      id:
        "easychina-route-halo",

      type:
        "line",

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

        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          5,
          15,
          8.5,
        ],

        "line-opacity":
          0.88,
      },
    });


    /* Main route */

    map.addLayer({
      id:
        "easychina-route-line",

      type:
        "line",

      source:
        "easychina-route",

      layout: {
        "line-cap":
          "round",

        "line-join":
          "round",
      },

      paint: {
        "line-gradient": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          "#173b78",
          0.52,
          "#2864c7",
          1,
          "#167c83",
        ],

        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          2.75,
          15,
          4.75,
        ],

        "line-opacity":
          1,
      },
    });
  }


  /* ======================================================
     MAP CONTROLS
     ====================================================== */

  function fitDayOnMap(
    map: mapboxgl.Map,
    day: TripDay,
    animated = true,
  ) {

    const bounds =
      new mapboxgl.LngLatBounds();


    day.stops.forEach(
      (stop) =>
        bounds.extend(
          stop.coordinates,
        ),
    );


    const mobile =
      window.innerWidth <=
      850;


    map.fitBounds(
      bounds,
      {
        padding:
          mobile
            ? {
                top: 110,
                right: 45,
                bottom: 320,
                left: 45,
              }
            : {
                top: 110,
                right: 90,
                bottom: 100,
                left: 470,
              },

        maxZoom: 14,

        duration:
          animated &&
          animationsEnabled
            ? 650
            : 0,

        essential: false,
      },
    );
  }


  function recenter() {
    if (
      !mapRef.current ||
      !activeDay
    ) {
      return;
    }


    fitDayOnMap(
      mapRef.current,
      activeDay,
    );
  }


  function selectStop(
    stop: TripStop,
  ) {

    setSelectedStopId(
      stop.id,
    );


    mapRef.current?.flyTo({
      center:
        stop.coordinates,

      zoom: 15,

      duration:
        animationsEnabled
          ? 480
          : 0,

      essential: false,
    });


    window.setTimeout(
      () => {

        document
          .getElementById(
            `trip-stop-${stop.id}`,
          )
          ?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });

      },
      180,
    );
  }


  function replayRoute() {
    if (
      !mapRef.current ||
      !activeDay
    ) {
      return;
    }


    visualizeDay(
      mapRef.current,
      activeDay,
    );
  }


  function switchDay(
    index: number,
  ) {

    setActiveDayIndex(
      index,
    );


    const first =
      trip?.days[index]
        ?.stops[0];


    if (first) {
      setSelectedStopId(
        first.id,
      );
    }


    setSheetExpanded(
      false,
    );
  }


  function addStop(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const stopName =
      newStopName.trim();

    if (!stopName) {
      return;
    }

    const nextMustVisit = [
      ...mustVisit,
      stopName,
    ].filter(
      (value, index, values) =>
        values.findIndex(
          (candidate) =>
            candidate.toLocaleLowerCase()
            === value.toLocaleLowerCase(),
        ) === index,
    );

    const nextParams =
      new URLSearchParams(
        searchParams,
      );

    nextParams.set(
      "must_visit",
      nextMustVisit.join(","),
    );

    setNewStopName("");
    setAddStopOpen(false);
    setSearchParams(
      nextParams,
      {
        replace: true,
      },
    );
  }


  /* ======================================================
     DRAW DAY
     ====================================================== */

  useEffect(() => {
    if (
      !mapReady ||
      !trip ||
      !mapRef.current
    ) {
      return;
    }

    const activeTripDay =
      trip.days[
        activeDayIndex
      ];

    if (!activeTripDay) {
      return;
    }

    visualizeDay(
      mapRef.current,
      activeTripDay,
    );

    // Mapbox drawing functions are intentionally imperative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapReady,
    trip,
    activeDayIndex,
  ]);


  /* ======================================================
     VALUES
     ====================================================== */

  const activeDay =
    trip?.days[
      activeDayIndex
    ];


  const distanceText =
    activeDay?.route
      ? formatDistance(
          activeDay.route
            .distance_meters,
          units,
        )
      : "—";


  const walkTimeText =
    activeDay?.route
      ? formatDuration(
          activeDay.route
            .duration_seconds,
        )
      : "—";


  /* ======================================================
     UI
     ====================================================== */

  return (
    <div
      className={
        animationsEnabled
          ? "visual-map-page"
          : "visual-map-page motion-off"
      }
    >

      {/* MAP */}

      <div
        ref={
          mapContainerRef
        }
        className="visual-map"
      />


      {/* FLOATING TOP */}

      <button
        className="map-round-button map-back"
        onClick={() =>
          navigate("/")
        }
      >
        <ArrowLeft
          size={24}
        />
      </button>


      <div className="map-city-name">
        {trip?.city || city}
      </div>


      <button
        className="map-round-button map-locate"
        onClick={recenter}
      >
        <LocateFixed
          size={23}
        />
      </button>


      {/* LOADING */}

      {loading && (

        <div className="ai-visual-loading">

          <div className="ai-loading-card">

            <div className="ai-loading-icon">
              <Sparkles
                size={26}
              />
            </div>

            <span>
              EASYCHINA AI
            </span>

            <h2>
              Building {city}
            </h2>

            <p>
              {
                loadingMessages[
                  loadingPhase
                ]
              }
              ...
            </p>

            <div className="ai-loading-track">

              <div
                style={{
                  width:
                    `${
                      (
                        (
                          loadingPhase +
                          1
                        ) /
                        loadingMessages.length
                      ) *
                      100
                    }%`,
                }}
              />

            </div>

          </div>

        </div>
      )}


      {/* ERROR */}

      {!loading &&
        error && (

        <div className="map-error-card">

          <Sparkles
            size={24}
          />

          <h2>
            Couldn't build
            your route
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


      {/* TRIP SHEET */}

      {!loading &&
        !error &&
        trip &&
        activeDay && (

        <section
          className={
            sheetExpanded
              ? "trip-sheet trip-sheet-expanded"
              : "trip-sheet"
          }
        >

          <button
            className="sheet-handle"
            onClick={() =>
              setSheetExpanded(
                !sheetExpanded,
              )
            }
            aria-expanded={
              sheetExpanded
            }
          >
            <span />

            <ChevronUp
              size={16}
            />
          </button>


          <div className="sheet-header">

            <div>

              <span className="sheet-ai-label">
                <Sparkles
                  size={13}
                />

                {copy.aiTrip}
              </span>

              <h2>
                {trip.title}
              </h2>

              <p>
                {trip.city}
                {" · "}
                {trip.days.length}
                {` ${copy.days}`}
              </p>

            </div>


            <button
              className="replay-mini"
              onClick={
                replayRoute
              }
            >
              <Play
                size={14}
                fill="currentColor"
              />

              {copy.replay}
            </button>

          </div>


          {trip.days.length >
            1 && (

            <div className="sheet-day-tabs">

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
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    switchDay(
                      index,
                    )
                  }
                >
                  {copy.day} {day.day}
                </button>

                ),
              )}

            </div>

          )}


          <div className="sheet-stats">

            <span>
              <Navigation
                size={15}
              />

              {distanceText}
            </span>

            <span>
              <Clock3
                size={15}
              />

              {walkTimeText}
            </span>

            <span>
              <MapPin
                size={15}
              />

              {
                activeDay
                  .stops
                  .length
              } {copy.stops}
            </span>

          </div>


          <div className="trip-stop-scroll">

            {activeDay.stops.map(
              (
                stop,
                index,
              ) => {

              const selected =
                selectedStopId ===
                stop.id;


              return (
                <button
                  id={
                    `trip-stop-${stop.id}`
                  }
                  key={
                    stop.id
                  }
                  className={
                    selected
                      ? "timeline-stop timeline-stop-selected"
                      : "timeline-stop"
                  }
                  onClick={() =>
                    selectStop(
                      stop,
                    )
                  }
                >

                  <div className="timeline-rail">

                    <span>
                      {index + 1}
                    </span>

                    {index <
                      activeDay
                        .stops
                        .length -
                        1 && (
                      <i />
                    )}

                  </div>


                  <div className="stop-type-icon">
                    <MapPin
                      size={18}
                    />

                    <span>
                      {stop.category}
                    </span>
                  </div>


                  <div className="timeline-stop-copy">

                    <strong>
                      {stop.name}
                    </strong>

                    <p>
                      {stop.reason}
                    </p>

                    <small>
                      {stop.time}
                      {" · "}
                      {
                        stop.duration_minutes
                      } min
                    </small>


                    {stop
                      .travel_to_next_meters && (

                      <span className="next-leg">

                        {formatDistance(
                          stop
                            .travel_to_next_meters,
                          units,
                        )}

                        {" · "}

                        {formatDuration(
                          stop
                            .travel_to_next_seconds ||
                            0,
                        )}

                        {` ${copy.toNext}`}

                      </span>

                    )}

                  </div>

                </button>
              );
            })}

          </div>


          {addStopOpen ? (

          <form
            className="add-stop-form"
            onSubmit={addStop}
          >
            <MapPin size={17} />

            <input
              autoFocus
              value={newStopName}
              onChange={(event) =>
                setNewStopName(
                  event.target.value,
                )
              }
              placeholder={
                copy.placeholder
              }
            />

            <button type="submit">
              {copy.include}
            </button>

            <button
              type="button"
              className="cancel-add-stop"
              onClick={() => {
                setAddStopOpen(false);
                setNewStopName("");
              }}
            >
              {copy.cancel}
            </button>
          </form>

          ) : (

          <div className="sheet-actions">

            <button
              className="add-stop-button"
              onClick={() => {
                setAddStopOpen(true);
                setSheetExpanded(true);
              }}
            >
              <Plus
                size={17}
              />

              {copy.addStop}
            </button>


            <button
              className="replan-button"
              onClick={() => {
                sessionStorage
                  .removeItem(
                    cacheKey,
                  );

                loadTrip(
                  true,
                );
              }}
            >
              <RotateCcw
                size={16}
              />

              {copy.replan}
            </button>

          </div>

          )}

          <small className="data-credit">
            Place data © OpenStreetMap contributors
          </small>

        </section>

      )}

    </div>
  );
}


/* =========================================================
   Helpers
   ========================================================= */

function formatDistance(
  meters: number,
  units: string,
) {
  if (units === "Imperial") {
    return `${(
      meters / 1609.344
    ).toFixed(1)} mi`;
  }

  return `${(
    meters / 1000
  ).toFixed(1)} km`;
}


function formatDuration(
  seconds: number,
) {

  const minutes =
    Math.round(
      seconds / 60,
    );


  if (
    minutes < 60
  ) {
    return `${minutes} min`;
  }


  const hours =
    Math.floor(
      minutes / 60,
    );


  const remaining =
    minutes % 60;


  return remaining
    ? `${hours} hr ${remaining} min`
    : `${hours} hr`;
}


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
