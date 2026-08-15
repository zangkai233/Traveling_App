import {
  ArrowRight,
  Bell,
  Heart,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";

import {
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import "./HomePage.css";


const interestOptions = [
  "Food",
  "Culture",
  "Nature",
  "Architecture",
  "Shopping",
  "Nightlife",
  "Hidden gems",
];


const chinaDestinations = [
  {
    city: "Beijing",
    region: "China",
    image:
      "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=900&q=85",
  },
  {
    city: "Guilin",
    region: "Guangxi",
    image:
      "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=900&q=85",
  },
  {
    city: "Shanghai",
    region: "China",
    image:
      "https://images.unsplash.com/photo-1548919973-5cef591cdbc9?auto=format&fit=crop&w=900&q=85",
  },
];


const canadaDestinations = [
  {
    city: "Banff",
    region: "Alberta",
    image:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=85",
  },
  {
    city: "Toronto",
    region: "Ontario",
    image:
      "https://images.unsplash.com/photo-1517090504586-fde19ea6066f?auto=format&fit=crop&w=900&q=85",
  },
  {
    city: "Vancouver",
    region: "British Columbia",
    image:
      "https://images.unsplash.com/photo-1559511260-66a654ae982a?auto=format&fit=crop&w=900&q=85",
  },
];


const surpriseCities = [
  "Toronto",
  "Vancouver",
  "Montreal",
  "Quebec City",
  "Banff",
];


const surpriseInterests = [
  [
    "Food",
    "Culture",
    "Hidden gems",
  ],
  [
    "Nature",
    "Architecture",
  ],
  [
    "Food",
    "Nightlife",
  ],
  [
    "Culture",
    "Architecture",
  ],
];


function HomePage() {
  const navigate =
    useNavigate();

  const plannerRef =
    useRef<HTMLDivElement | null>(
      null,
    );


  const [
    city,
    setCity,
  ] = useState("Toronto");

  const [
    days,
    setDays,
  ] = useState(1);

  const [
    mustVisit,
    setMustVisit,
  ] = useState("");

  const [
    interests,
    setInterests,
  ] = useState<string[]>([
    "Food",
    "Culture",
  ]);


  function toggleInterest(
    value: string,
  ) {
    setInterests(
      (current) =>
        current.includes(value)
          ? current.filter(
              (item) =>
                item !== value,
            )
          : [
              ...current,
              value,
            ],
    );
  }


  function openPlannerFor(
    destination: string,
  ) {
    setCity(destination);

    plannerRef.current
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
  }


  function planTrip(
    surprise = false,
  ) {
    let selectedCity =
      city.trim();

    let selectedInterests =
      interests;


    if (surprise) {
      selectedCity =
        surpriseCities[
          Math.floor(
            Math.random() *
              surpriseCities.length,
          )
        ];

      selectedInterests =
        surpriseInterests[
          Math.floor(
            Math.random() *
              surpriseInterests.length,
          )
        ];
    }


    if (!selectedCity) {
      return;
    }


    const savedPace =
      localStorage.getItem(
        "easychina.pace",
      ) || "balanced";


    const params =
      new URLSearchParams({
        city:
          selectedCity,

        days:
          String(days),

        interests:
          selectedInterests.join(
            ", ",
          ),

        pace:
          savedPace,

        must_visit:
          mustVisit.trim(),

        surprise:
          surprise
            ? "1"
            : "0",
      });


    navigate(
      `/map?${params.toString()}`,
    );
  }


  return (
    <div className="travel-home">

      {/* HERO */}

      <section className="home-hero">

        <div className="hero-shade" />


        <div className="hero-actions">

          <button
            className="hero-circle"
            aria-label="Search"
            onClick={() =>
              plannerRef.current
                ?.scrollIntoView({
                  behavior: "smooth",
                })
            }
          >
            <Search size={23} />
          </button>


          <button
            className="hero-circle"
            aria-label="Notifications"
          >
            <Bell size={22} />
          </button>

        </div>


        <div className="hero-copy">

          <span className="featured-label">
            FEATURED DESTINATION
          </span>


          <h1>
            Banff National
            <br />
            Park
          </h1>


          <p>
            Turquoise lakes,
            mountain air and
            unforgettable trails.
          </p>


          <button
            className="explore-hero-button"
            onClick={() =>
              openPlannerFor(
                "Banff",
              )
            }
          >
            Explore now

            <ArrowRight
              size={20}
            />
          </button>

        </div>


        <div className="hero-pages">
          <span className="active" />
          <span />
          <span />
        </div>

      </section>


      {/* CONTENT */}

      <main className="home-content">

        {/* AI PLANNER */}

        <section
          className="quick-planner"
          ref={plannerRef}
        >

          <div className="planner-title-row">

            <div>
              <span className="planner-kicker">
                <Sparkles
                  size={14}
                />

                AI TRIP PLANNER
              </span>

              <h2>
                Where do you
                want to go?
              </h2>
            </div>

          </div>


          <label className="destination-field">

            <MapPin
              size={20}
            />

            <div>
              <span>
                Destination
              </span>

              <input
                value={city}
                onChange={
                  (event) =>
                    setCity(
                      event.target
                        .value,
                    )
                }
                placeholder="Toronto"
              />
            </div>

          </label>


          <div className="planner-grid">

            <div className="planner-control">

              <span>
                Trip length
              </span>

              <div className="days-choice">

                {[1, 2, 3].map(
                  (value) => (
                    <button
                      key={value}
                      className={
                        days === value
                          ? "active"
                          : ""
                      }
                      onClick={() =>
                        setDays(
                          value,
                        )
                      }
                    >
                      {value} day
                    </button>
                  ),
                )}

              </div>

            </div>


            <div className="planner-control">

              <span>
                Must visit
              </span>

              <input
                className="must-visit-input"
                value={
                  mustVisit
                }
                onChange={
                  (event) =>
                    setMustVisit(
                      event.target
                        .value,
                    )
                }
                placeholder="CN Tower, AGO..."
              />

            </div>

          </div>


          <div className="interest-section">

            <span>
              What are you into?
            </span>

            <div className="interest-chips">

              {interestOptions.map(
                (item) => (

                  <button
                    key={item}
                    className={
                      interests.includes(
                        item,
                      )
                        ? "selected"
                        : ""
                    }
                    onClick={() =>
                      toggleInterest(
                        item,
                      )
                    }
                  >
                    {item}
                  </button>

                ),
              )}

            </div>

          </div>


          <div className="planner-buttons">

            <button
              className="primary-plan"
              onClick={() =>
                planTrip(false)
              }
            >
              Plan with AI

              <ArrowRight
                size={19}
              />
            </button>


            <button
              className="surprise-plan"
              onClick={() =>
                planTrip(true)
              }
            >
              <Sparkles
                size={18}
              />

              Surprise me
            </button>

          </div>

        </section>


        {/* CHINA */}

        <DestinationSection
          title="Explore China"
          destinations={
            chinaDestinations
          }
          onSelect={
            openPlannerFor
          }
        />


        {/* CANADA */}

        <DestinationSection
          title="Explore Canada"
          destinations={
            canadaDestinations
          }
          onSelect={
            openPlannerFor
          }
        />


        {/* RECOMMENDED */}

        <section className="recommended-card">

          <div>
            <span>
              RECOMMENDED FOR YOU
            </span>

            <h2>
              Toronto in one day.
            </h2>

            <p>
              Markets, architecture,
              waterfront views and
              local neighbourhoods.
            </p>
          </div>


          <button
            onClick={() => {
              setCity(
                "Toronto",
              );

              setDays(1);

              planTrip(false);
            }}
          >
            Generate route

            <ArrowRight
              size={18}
            />
          </button>

        </section>


        <div className="home-nav-spacer" />

      </main>

    </div>
  );
}


function DestinationSection({
  title,
  destinations,
  onSelect,
}: {
  title: string;
  destinations:
    typeof canadaDestinations;
  onSelect:
    (city: string) => void;
}) {

  return (
    <section className="destination-section">

      <div className="section-row">

        <h2>
          {title}
        </h2>

        <button>
          See all
          <ArrowRight
            size={15}
          />
        </button>

      </div>


      <div className="destination-scroll">

        {destinations.map(
          (destination) => (

            <button
              className="visual-destination-card"
              key={
                destination.city
              }
              onClick={() =>
                onSelect(
                  destination.city,
                )
              }
            >

              <img
                src={
                  destination.image
                }
                alt={
                  destination.city
                }
              />


              <div className="destination-shade" />


              <Heart
                className="destination-heart"
                size={20}
              />


              <div className="destination-card-copy">

                <strong>
                  {
                    destination.city
                  }
                </strong>

                <span>
                  {
                    destination.region
                  }
                </span>

              </div>

            </button>

          ),
        )}

      </div>

    </section>
  );
}


export default HomePage;