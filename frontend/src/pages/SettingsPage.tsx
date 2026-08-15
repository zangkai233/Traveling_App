import {
  ChevronRight,
  Globe2,
  Map,
  Route,
  UserRound,
} from "lucide-react";

import { useEffect, useState } from "react";

import "./SettingsPage.css";

type Pace =
  | "relaxed"
  | "balanced"
  | "fast";

function SettingsPage() {
  const [language, setLanguage] =
    useState(
      localStorage.getItem("easychina.language") ||
        "English",
    );

  const [units, setUnits] =
    useState(
      localStorage.getItem("easychina.units") ||
        "Metric",
    );

  const [pace, setPace] =
    useState<Pace>(
      (localStorage.getItem(
        "easychina.pace",
      ) as Pace) || "balanced",
    );

  const [animations, setAnimations] =
    useState(
      localStorage.getItem("easychina.animations") !==
        "false",
    );

  useEffect(() => {
    localStorage.setItem(
      "easychina.language",
      language,
    );

    localStorage.setItem(
      "easychina.units",
      units,
    );

    localStorage.setItem(
      "easychina.pace",
      pace,
    );

    localStorage.setItem(
      "easychina.animations",
      String(animations),
    );
  }, [
    language,
    units,
    pace,
    animations,
  ]);

  return (
    <div className="settings-page">
      <header className="settings-header">
        <span>ACCOUNT & APP</span>
        <h1>Settings</h1>
      </header>

      <main className="settings-content">
        <section className="settings-profile">
          <div className="settings-avatar">
            K
          </div>

          <div>
            <h2>Kai</h2>
            <p>EasyChina account</p>
          </div>

          <ChevronRight size={18} />
        </section>

        <SettingsGroup title="Travel preferences">
          <div className="setting-row">
            <div className="setting-icon">
              <Route size={18} />
            </div>

            <div className="setting-text">
              <strong>Travel pace</strong>
              <span>
                Used when AI builds your itinerary
              </span>
            </div>
          </div>

          <div className="setting-choice-row">
            {(
              [
                "relaxed",
                "balanced",
                "fast",
              ] as Pace[]
            ).map((option) => (
              <button
                key={option}
                className={
                  pace === option
                    ? "setting-choice active"
                    : "setting-choice"
                }
                onClick={() =>
                  setPace(option)
                }
              >
                {capitalize(option)}
              </button>
            ))}
          </div>
        </SettingsGroup>

        <SettingsGroup title="Region">
          <div className="setting-row">
            <div className="setting-icon">
              <Globe2 size={18} />
            </div>

            <div className="setting-text">
              <strong>Language</strong>
              <span>
                Interface language
              </span>
            </div>

            <select
              value={language}
              onChange={(e) =>
                setLanguage(e.target.value)
              }
            >
              <option>English</option>
              <option>简体中文</option>
              <option>Français</option>
            </select>
          </div>

          <div className="setting-row">
            <div className="setting-icon">
              <Map size={18} />
            </div>

            <div className="setting-text">
              <strong>Distance units</strong>
              <span>
                Used for route information
              </span>
            </div>

            <select
              value={units}
              onChange={(e) =>
                setUnits(e.target.value)
              }
            >
              <option>Metric</option>
              <option>Imperial</option>
            </select>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Experience">
          <div className="setting-row">
            <div className="setting-icon">
              <UserRound size={18} />
            </div>

            <div className="setting-text">
              <strong>
                Interface animations
              </strong>

              <span>
                Smooth transitions and route animation
              </span>
            </div>

            <button
              className={
                animations
                  ? "settings-toggle settings-toggle-on"
                  : "settings-toggle"
              }
              onClick={() =>
                setAnimations(!animations)
              }
            >
              <span />
            </button>
          </div>
        </SettingsGroup>

        <section className="settings-about">
          <strong>EasyChina</strong>
          <span>AI Travel Platform · Preview</span>
        </section>
      </main>

      <div className="settings-bottom-space" />
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-group">
      <h3>{title}</h3>

      <div className="settings-card">
        {children}
      </div>
    </section>
  );
}

function capitalize(value: string) {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

export default SettingsPage;