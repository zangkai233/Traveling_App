import {
  Languages,
  MapPin,
  Search,
  ShieldCheck,
  Star,
} from "lucide-react";

import "./GuidePage.css";

const guides = [
  {
    name: "Daniel Chen",
    initials: "DC",
    city: "Toronto",
    rating: 4.96,
    reviews: 128,
    price: 38,
    languages: "English · Mandarin",
    tags: ["Food", "Architecture", "Photography"],
    bio: "Local photographer who knows Toronto's food, design and hidden neighbourhoods.",
  },
  {
    name: "Maya Liu",
    initials: "ML",
    city: "Toronto",
    rating: 4.92,
    reviews: 86,
    price: 34,
    languages: "English · Mandarin · Cantonese",
    tags: ["Culture", "Museums", "Local life"],
    bio: "History student and museum lover focused on slower, thoughtful city experiences.",
  },
  {
    name: "James Park",
    initials: "JP",
    city: "Toronto",
    rating: 4.89,
    reviews: 72,
    price: 32,
    languages: "English · Korean",
    tags: ["Nightlife", "Food", "Streetwear"],
    bio: "Downtown local for visitors who want restaurants, nightlife and modern Toronto.",
  },
];

function GuidePage() {
  return (
    <div className="guide-page">
      <header className="guide-header">
        <span>EasyChina Guide</span>

        <h1>
          Explore with
          <br />
          someone local.
        </h1>

        <p>
          Find people who know the city beyond the
          guidebook.
        </p>
      </header>

      <div className="guide-search">
        <Search size={18} />

        <input
          placeholder="Search city or experience"
          defaultValue="Toronto"
        />
      </div>

      <section className="guide-section">
        <div className="guide-section-title">
          <h2>Available in Toronto</h2>

          <span>12 guides</span>
        </div>

        <div className="guide-grid">
          {guides.map((guide) => (
            <article
              className="guide-card"
              key={guide.name}
            >
              <div className="guide-card-top">
                <div className="guide-avatar">
                  {guide.initials}
                </div>

                <div className="guide-online">
                  Available today
                </div>
              </div>

              <h3>{guide.name}</h3>

              <div className="guide-location">
                <MapPin size={13} />
                {guide.city}
              </div>

              <div className="guide-rating">
                <Star size={14} fill="currentColor" />

                <strong>{guide.rating}</strong>

                <span>
                  ({guide.reviews} reviews)
                </span>
              </div>

              <p className="guide-bio">
                {guide.bio}
              </p>

              <div className="guide-language">
                <Languages size={14} />
                {guide.languages}
              </div>

              <div className="guide-tags">
                {guide.tags.map((tag) => (
                  <span key={tag}>
                    {tag}
                  </span>
                ))}
              </div>

              <div className="guide-footer">
                <div>
                  <strong>${guide.price}</strong>
                  <span> / hour</span>
                </div>

                <button>
                  View guide
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="guide-safety">
          <ShieldCheck size={22} />

          <div>
            <strong>
              EasyChina verified
            </strong>

            <p>
              Identity verification and reviews will
              be added before real bookings launch.
            </p>
          </div>
        </div>
      </section>

      <div className="guide-bottom-space" />
    </div>
  );
}

export default GuidePage;