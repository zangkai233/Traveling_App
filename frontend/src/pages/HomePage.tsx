import {
  ArrowRight,
  Clock3,
  MapPin,
  Navigation,
  Sparkles,
} from "lucide-react";

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import "./HomePage.css";

const quickCities = [
  "Toronto",
  "Beijing",
  "Shanghai",
  "Chengdu",
];

function HomePage() {
  const navigate = useNavigate();

  const [city, setCity] = useState("Toronto");
  const [days, setDays] = useState(1);

  function planTrip() {
    if (!city.trim()) return;

    const params = new URLSearchParams({
      city: city.trim(),
      days: String(days),
      interests: "food, architecture, culture, local experiences",
      pace: "balanced",
    });

    navigate(`/map?${params.toString()}`);
  }

  return (
    <div className="new-home">
      <header className="new-home-header">
        <div className="easychina-logo">
          EasyChina
        </div>

        <button className="profile-pill">
          K
        </button>
      </header>

      <main className="new-home-main">
        <section className="hero-left">
          <div className="home-ai-label">
            <Sparkles size={14} />
            AI TRAVEL
          </div>

          <h1>Where to?</h1>

          <p>
            One city. One tap.
            <br />
            We'll build the journey.
          </p>

          <div className="uber-search-card">
            <div className="destination-input">
              <MapPin size={21} />

              <div>
                <span>Destination</span>

                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      planTrip();
                    }
                  }}
                  placeholder="Where are you going?"
                />
              </div>
            </div>

            <div className="home-divider" />

            <div className="trip-days-row">
              <span>Trip length</span>

              <div>
                {[1, 2, 3].map((value) => (
                  <button
                    key={value}
                    className={
                      days === value
                        ? "trip-day trip-day-active"
                        : "trip-day"
                    }
                    onClick={() => setDays(value)}
                  >
                    {value}D
                  </button>
                ))}
              </div>
            </div>

            <button
              className="home-plan-button"
              onClick={planTrip}
            >
              Plan with AI

              <ArrowRight size={20} />
            </button>
          </div>

          <div className="quick-destinations">
            {quickCities.map((item) => (
              <button
                key={item}
                onClick={() => setCity(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="home-trip-preview">
          <div className="preview-map-grid" />

          <div className="preview-top">
            <div>
              <small>YOUR NEXT JOURNEY</small>
              <h2>Toronto</h2>
            </div>

            <span className="preview-ai">
              <Sparkles size={13} />
              AI
            </span>
          </div>

          <div className="preview-route">
            <div className="fake-route route-a" />
            <div className="fake-route route-b" />
            <div className="fake-route route-c" />

            <PreviewPoint
              number={1}
              className="p1"
              label="CN Tower"
            />

            <PreviewPoint
              number={2}
              className="p2"
              label="St. Lawrence"
            />

            <PreviewPoint
              number={3}
              className="p3"
              label="Distillery"
            />

            <PreviewPoint
              number={4}
              className="p4"
              label="Waterfront"
            />
          </div>

          <div className="preview-info">
            <div>
              <Navigation size={17} />
              <span>
                <strong>5.8 km</strong>
                Route
              </span>
            </div>

            <div>
              <Clock3 size={17} />
              <span>
                <strong>1 day</strong>
                Adventure
              </span>
            </div>

            <button onClick={planTrip}>
              Open map
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </main>

      <section className="home-secondary">
        <div>
          <span className="home-section-label">
            DISCOVER
          </span>

          <h2>Built around you.</h2>
        </div>

        <div className="home-feature-grid">
          <article>
            <Sparkles size={22} />
            <h3>AI itinerary</h3>
            <p>
              A complete trip built around your interests
              and pace.
            </p>
          </article>

          <article>
            <Navigation size={22} />
            <h3>Smart routes</h3>
            <p>
              Stops arranged into practical routes instead
              of random recommendations.
            </p>
          </article>

          <article>
            <MapPin size={22} />
            <h3>Local guides</h3>
            <p>
              Discover people who can show you the city
              beyond the obvious.
            </p>
          </article>
        </div>
      </section>

      <div className="bottom-nav-space" />
    </div>
  );
}

function PreviewPoint({
  number,
  label,
  className,
}: {
  number: number;
  label: string;
  className: string;
}) {
  return (
    <div className={`preview-point ${className}`}>
      <span>{number}</span>
      <strong>{label}</strong>
    </div>
  );
}

export default HomePage;