import React from "react";
import { Link } from "react-router-dom";
import * as AuthService from "../auth/AuthService";
import "./HomePage.css";

const HomePage: React.FC = () => {
  // Check if user is authenticated
  const isAuthenticated = AuthService.isAuthenticated();

  return (
    <section className="hero text-center">
      <div className="hero-content">
        <h1 className="hero-title">Den enkleste måten å administrere hjemmetjeneste på</h1>
        <p className="hero-text">
          Hjelper deg å håndtere hjemmebesøk, timeplaner og oppfølging — alt på ett sted for helsepersonell i hjemmetjenesten.
        </p>

        {/* Services features */}
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><i className="bi bi-calendar-check text-secondary"></i></div>
            <h5 className="feature-title">Enkel planlegging</h5>
            <p className="feature-text">Book og administrer avtaler enkelt. Oppdatert tilgjengelighet i sanntid.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <i className="bi bi-heart text-secondary"></i>
            </div>
            <h5 className="feature-title">Pasientfokusert</h5>
            <p className="feature-text">Personlige oppfølgingsplaner for hver pasients behov.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <i className="bi bi-shield-lock text-secondary"></i>
            </div>
            <h5 className="feature-title">Sikker og privat</h5>
            <p className="feature-text">Kryptering for alle sensitive data.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <i className="bi bi-clock-history text-secondary"></i>
            </div>
            <h5 className="feature-title">Tilgang 24/7</h5>
            <p className="feature-text">Tilgang til timeplan og informasjon når som helst.</p>
          </div>
        </div>

        {/* Call-to-action buttons */}
        <div className="hero-buttons">
          <Link className="cta" to={isAuthenticated ? "/dashboard" : "/login"}>
            Logg inn <i className="bi bi-arrow-right"></i>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HomePage;