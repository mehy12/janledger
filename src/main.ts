/// <reference path="./globals.d.ts" />
import './style.css';

declare const L: any;

const app = document.getElementById('app')!;

// Global map reference so search can control it
let dashboardMap: any = null;

// Selected ledger entry for detail page
let selectedEntry: LedgerEntry | null = null;
let reportStep: 1 | 2 = 1;
let capturedImage: string | null = null;
let cameraStream: MediaStream | null = null;

// Router
type Route = 'landing' | 'dashboard' | 'report' | 'detail' | 'admin' | 'ledger';

let currentRoute: Route = 'landing';

const GEMINI_API_KEY =
  (globalThis as { JANLEDGER_GEMINI_API_KEY?: string }).JANLEDGER_GEMINI_API_KEY ||
  'AIzaSyD3pClAQ_46sbrLiBhgllSNh_tcw46SzVk';
const GEMINI_MODEL = 'gemini-1.5-flash';
const DUPLICATE_RADIUS_METERS = 30;
const ledgerStorageKey = 'janledger:ledger-entries';

let ledgerEntries: LedgerEntry[] = [];
let reportGeo: { lat: number; lng: number; address: string } | null = null;
let reportAiExtraction: ExtractedIssue | null = null;
let reportAiPending = false;
let reportAiError: string | null = null;
let reportDuplicateMatchId: string | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function navigate(route: Route) {
  if (currentRoute === 'report' && route !== 'report') {
    stopCamera();
  }
  currentRoute = route;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  switch (currentRoute) {
    case 'landing':
      app.innerHTML = renderNav('Explore') + renderLanding() + renderFooter() + renderMobileNav('Feed');
      break;
    case 'dashboard':
      app.innerHTML = renderNav('Dashboard') + renderDashboard() + renderMobileNav('Map');
      initMap();
      break;
    case 'report':
      app.innerHTML = renderReport() + renderMobileNav('Report');
      break;
    case 'detail':
      app.innerHTML = renderNav('Report') + renderDetail() + renderFooter() + renderMobileNav('Feed');
      break;
    case 'admin':
      app.innerHTML = renderNav('Dashboard') + renderAdmin() + renderMobileNav('');
      break;
    case 'ledger':
      app.innerHTML = renderNav('Explore') + renderLedger() + renderFooter() + renderMobileNav('Feed');
      break;
  }
  attachListeners();
}

function renderMobileNav(active: string): string {
  return `
    <nav class="mobile-bottom-nav">
      <a href="#" class="mobile-nav-item ${active === 'Map' ? 'active' : ''}" data-nav="dashboard">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
        <span>Map</span>
      </a>
      <a href="#" class="mobile-nav-item ${active === 'Feed' ? 'active' : ''}" data-nav="ledger">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <span>Feed</span>
      </a>
      <a href="#" class="mobile-nav-item ${active === 'Report' ? 'active' : ''}" data-nav="report">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        <span>Report</span>
      </a>
      <a href="#" class="mobile-nav-item ${active === 'Profile' ? 'active' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        <span>Profile</span>
      </a>
    </nav>
  `;
}

// ============================================
// Navigation
// ============================================
function renderNav(active: string): string {
  if (active === 'Dashboard') {
    return `
    <nav class="nav dashboard-nav-modern">
      <div class="nav-left">
        <a href="#" class="nav-logo" data-nav="landing"><span style="color:var(--green-800, #094b39)">Jan</span>Ledger</a>
        <div class="nav-links modern-links">
          <a href="#" data-nav="dashboard">Regional</a>
          <a href="#" data-nav="ledger">Explore</a>
          <a href="#" class="active" data-nav="dashboard">Dashboard</a>
          <a href="#" data-nav="admin">Verify</a>
        </div>
      </div>
      <div class="nav-right modern-right">
        <button class="nav-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg></button>
        <button class="nav-icon-btn"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
        <div class="nav-avatar-modern">
          <img src="/images/avatar.png" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iIzMzMyIvPjwvc3ZnPg=='" alt="User" />
        </div>
      </div>
    </nav>`;
  }

  return `
  <nav class="nav">
    <div class="nav-left">
      <a href="#" class="nav-logo" data-nav="landing">JanLedger</a>
      <div class="nav-links">
        <a href="#" ${active === 'Explore' ? 'class="active"' : ''} data-nav="ledger">Feed</a>
        <a href="#" ${active === 'Report' ? 'class="active"' : ''} data-nav="report">Report</a>
        <a href="#" ${active === 'Dashboard' ? 'class="active"' : ''} data-nav="dashboard">Dashboard</a>
        <a href="#" data-nav="admin">Verify</a>
      </div>
    </div>
    <div class="nav-right">
      <span class="nav-search-icon">🔍</span>
      <button class="btn-login" data-nav="admin">Login</button>
      <button class="btn-get-started" data-nav="report">Get Started</button>
    </div>
  </nav>`;
}

// ============================================
// Landing Page
// ============================================
function renderLanding(): string {
  return `
  <div class="landing">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-left">
        <div class="hero-badge">Blockchain Verified Governance</div>
        <h1 class="hero-title">Transparent<br><span>Governance</span><br>Starts Here</h1>
        <p class="hero-subtitle">Track, verify, and support real civic issues in your community. Every action is recorded immutably to ensure accountability.</p>
        <div class="hero-buttons">
          <button class="btn-primary" data-nav="report">Report an Issue →</button>
          <button class="btn-secondary" data-nav="dashboard">Explore Issues</button>
        </div>
      </div>
      <div class="hero-right">
        <div class="network-widget">
          <div class="network-widget-header">
            <span class="network-widget-title">Network Health</span>
            <span class="network-widget-live">Live</span>
          </div>
          <div class="network-widget-sub">Real-time civic ledger</div>
          <div class="network-widget-bar"><div class="network-widget-bar-fill"></div></div>
          <div class="network-widget-stats">
            <div class="network-stat">
              <span class="network-stat-label">Uptime</span>
              <span class="network-stat-value">99.98%</span>
            </div>
            <div class="network-stat">
              <span class="network-stat-label">Validators</span>
              <span class="network-stat-value">428</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="stats-section">
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon complaints">💬</div>
          <span class="stat-change">+12%</span>
        </div>
        <div class="stat-number">12.4k</div>
        <div class="stat-label">Total complaints logged</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon resolved">✓</div>
          <span class="stat-change">+8%</span>
        </div>
        <div class="stat-number">8.2k</div>
        <div class="stat-label">Issues resolved by authorities</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-icon regions">🌐</div>
          <span class="stat-change" style="color:var(--text-muted)">Active Nodes</span>
        </div>
        <div class="stat-number">42</div>
        <div class="stat-label">Active metropolitan regions</div>
      </div>
    </section>

    <!-- Civic Accountability -->
    <section class="civic-section">
      <div class="civic-left">
        <h2 class="civic-section-title">The New Standard for<br><em>Civic Accountability.</em></h2>
        <div class="civic-features">
          <div class="civic-feature">
            <div class="civic-feature-icon">🛡️</div>
            <div>
              <h4>Immutable Ledger</h4>
              <p>Once a report is filed, it can never be deleted or altered by any authority.</p>
            </div>
          </div>
          <div class="civic-feature">
            <div class="civic-feature-icon">📍</div>
            <div>
              <h4>Geospatial Precision</h4>
              <p>Attach precise coordinates and visual evidence to every civic report.</p>
            </div>
          </div>
        </div>
      </div>
      <div class="civic-right">
        <div class="civic-image">
          <img src="/images/building.png" alt="Modern civic building" />
        </div>
        <div class="civic-testimonial">
          <p>"Had ridges twisted on bank street lighting reports that were delayed for 3 months. Accountability is finally visible."</p>
          <div class="civic-testimonial-author">
            <div class="civic-testimonial-avatar">CB</div>
            <div>
              <div class="civic-testimonial-info">Community Board 7</div>
              <div class="civic-testimonial-role">Verified Authority</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="cta-section">
      <h2>Ready to take ownership of your city?</h2>
      <p>Join thousands of citizens who are building the most transparent city infrastructure in the world.</p>
      <button class="btn-primary" data-nav="report">Start Your First Report</button>
    </section>
  </div>`;
}

// ============================================
// Dashboard Page
// ============================================
function renderSidebar(activePage: 'dashboard' | 'admin' | 'ledger'): string {
  return `
    <aside class="sidebar dashboard-sidebar">
      <div class="sidebar-header-modern">
        <div class="sidebar-icon-box">🏛️</div>
        <div>
          <div class="sidebar-title-modern">Bangalore<br>Division</div>
          <div class="sidebar-subtitle-modern">SOVEREIGN NODE</div>
        </div>
      </div>

      <div class="sidebar-scroll">
        <div class="sidebar-section-title"><span class="sidebar-section-icon">🏛️</span> CORE AUTHORITIES</div>
        <div class="sidebar-menu-modern">
          <div class="sidebar-item-modern active" data-nav="dashboard">
            <div class="sidebar-item-icon">🏢</div>
            <div class="sidebar-item-content">
              <div class="sidebar-item-name">BBMP</div>
              <div class="sidebar-item-desc">Roads, Garbage, Lights, Parks</div>
            </div>
          </div>
          <div class="sidebar-item-modern" data-nav="dashboard">
            <div class="sidebar-item-icon">💧</div>
            <div class="sidebar-item-content">
              <div class="sidebar-item-name">BWSSB</div>
              <div class="sidebar-item-desc">Water Supply, Leakage, Sewage</div>
            </div>
          </div>
          <div class="sidebar-item-modern" data-nav="dashboard">
            <div class="sidebar-item-icon">⚡</div>
            <div class="sidebar-item-content">
              <div class="sidebar-item-name">BESCOM</div>
              <div class="sidebar-item-desc">Power, Transformers, Faults</div>
            </div>
          </div>
        </div>

        <div class="sidebar-section-title"><span class="sidebar-section-icon">🏙️</span> CIVIC INFRASTRUCTURE</div>
        <div class="sidebar-menu-modern mini">
          <div class="sidebar-item-modern mini" data-nav="dashboard">
            <span class="sidebar-item-icon-mini">👮</span>
            Law & Order
          </div>
          <div class="sidebar-item-modern mini" data-nav="dashboard">
            <span class="sidebar-item-icon-mini">🚦</span>
            Traffic Management
          </div>
          <div class="sidebar-item-modern mini" data-nav="dashboard">
            <span class="sidebar-item-icon-mini">🛣️</span>
            Roads & Highways
          </div>
          <div class="sidebar-item-modern mini" data-nav="dashboard">
            <span class="sidebar-item-icon-mini">🚇</span>
            Metro & Transport
          </div>
          <div class="sidebar-item-modern mini" data-nav="dashboard">
            <span class="sidebar-item-icon-mini">🌳</span>
            Environment
          </div>
        </div>
      </div>
      
      <div class="sidebar-footer-modern">
        <button class="btn-primary-modern" data-nav="admin">+ New Verification</button>
      </div>
    </aside>`;
}

function renderDashboard(): string {
  return `
  <div class="dashboard-layout modern">
    ${renderSidebar('dashboard')}

    <!-- Main -->
    <div class="dashboard-main-modern">
      <div class="dashboard-header-modern">
        <div class="dashboard-header-titles">
          <div class="suptitle">SYSTEM DASHBOARD</div>
          <h1 class="title">Civic Oversight: <span>Metropolitan Central</span></h1>
        </div>
        <div class="dashboard-header-sync">
          <div class="sync-label">Last Synced</div>
          <div class="sync-time">Today, 09:42 AM</div>
        </div>
      </div>

      <div class="dashboard-stats-grid">
        <div class="stat-card-modern light">
          <div class="stat-icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>
          </div>
          <div class="stat-value">1,284</div>
          <div class="stat-label">ACTIVE BBMP CASES</div>
        </div>
        <div class="stat-card-modern dark">
          <div class="stat-icon-wrapper green">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div class="stat-value">4.2d</div>
          <div class="stat-label">AVG. RESOLUTION TIME</div>
        </div>
        <div class="stat-card-modern pale">
          <div class="stat-pale-bg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 8 17 13"></polyline><polyline points="7 19 12 14 17 19"></polyline></svg>
          </div>
          <div class="stat-icon-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline></svg>
          </div>
          <div class="stat-value">92%</div>
          <div class="stat-label">PUBLIC TRUST INDEX</div>
        </div>
      </div>

      <div class="dashboard-content-grid">
        <div class="dash-col-left">
          <div class="dash-section-header">
            <h2>Recent Civic Grievances</h2>
            <a href="#" data-nav="ledger" class="dash-link">View Ledger →</a>
          </div>
          <div class="grievance-cards">
            <div class="grievance-row" data-nav="detail">
              <div class="g-badges"><span class="badge red">CRITICAL</span> <span class="g-ticket">Ticket #BBMP-9921</span></div>
              <div class="g-main-row">
                <div class="g-info">
                  <div class="g-title">Pothole Repair - Indiranagar 100ft Rd</div>
                  <div class="g-location">📍 Ward 80, Old Madras Road Junction</div>
                </div>
                <div class="g-meta">
                  <div class="g-time">Logged 2h ago</div>
                  <div class="g-action bold">Urgent Dispatch</div>
                  <div class="g-arrow">›</div>
                </div>
              </div>
            </div>

            <div class="grievance-row" data-nav="detail">
              <div class="g-badges"><span class="badge blue">IN PROGRESS</span> <span class="g-ticket">Ticket #BBMP-8842</span></div>
              <div class="g-main-row">
                <div class="g-info">
                  <div class="g-title">Streetlight Maintenance - Koramangala 4th Block</div>
                  <div class="g-location">📍 Ward 151, near Maharaja Signal</div>
                </div>
                <div class="g-meta">
                  <div class="g-time">Logged 1d ago</div>
                  <div class="g-action bold">Crew Assigned</div>
                  <div class="g-arrow">›</div>
                </div>
              </div>
            </div>

            <div class="grievance-row" data-nav="detail">
              <div class="g-badges"><span class="badge green">RESOLVED</span> <span class="g-ticket">Ticket #BBMP-7521</span></div>
              <div class="g-main-row">
                <div class="g-info">
                  <div class="g-title">Sanitation Waste Collection - Whitefield</div>
                  <div class="g-location">📍 Ward 184, Borewell Road</div>
                </div>
                <div class="g-meta">
                  <div class="g-time">Closed 4h ago</div>
                  <div class="g-action bold green-text">Verification Done</div>
                  <div class="g-arrow">›</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="dash-col-right">
          <div class="dash-side-card pale-bg">
            <div class="dash-side-title">REGIONAL FOCUS</div>
            <div class="dash-map-thumb">
              <button class="dash-map-btn" data-nav="dashboard">ENLARGE MAP</button>
            </div>
            <div class="dash-metrics-list">
              <div class="dash-metric-row"><span>Active Zones</span> <span class="bold">8 Clusters</span></div>
              <div class="dash-metric-row"><span>Verify Load</span> <span class="bold red-text">High</span></div>
              <div class="dash-metric-row"><span>Node Status</span> <span class="bold">Sovereign</span></div>
            </div>
          </div>

          <div class="dash-side-card mint-bg">
            <div class="dash-side-title">AUTHORITY UPDATE</div>
            <div class="dash-quote">
              "The digital ledger has achieved consensus for the Q3 regional budget allocation. All ward portals must synchronize by midnight."
            </div>
            <div class="dash-author">
              <div class="dash-avatar">
                <img src="/images/building.png" style="border-radius:50%; width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'" alt="Author" />
              </div>
              <div class="dash-author-info">
                <div class="dash-author-role">Deputy Commissioner</div>
                <div class="dash-author-unit">CIVIC LEDGER HUB</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderFeedCard(
  img: string,
  title: string,
  location: string,
  desc: string,
  status: string,
  upvotes: number,
  comments: number,
  txId: string,
  isNodeCheck: boolean = false
): string {
  const statusLabel = status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1);
  return `
  <div class="feed-card" data-nav="detail">
    <div class="feed-card-top">
      <div class="feed-card-thumb">
        <img src="${img}" alt="${title}" />
      </div>
      <div class="feed-card-info">
        <div class="feed-card-title-row">
          <span class="feed-card-title">${title}</span>
          <span class="status-badge ${status}">${statusLabel}</span>
        </div>
        <div class="feed-card-location">${location}</div>
        <div class="feed-card-desc">${desc}</div>
      </div>
    </div>
    <div class="feed-card-bottom">
      <div class="feed-card-meta">
        <span>👍 ${upvotes} Upvotes</span>
        ${isNodeCheck ? '<span>⚙️ Node Check</span>' : `<span>💬 ${comments}</span>`}
      </div>
      <span class="feed-card-tx">${txId}</span>
    </div>
  </div>`;
}

// ============================================
// Map Initialization
// ============================================
// Koramangala center coordinates
const KORAMANGALA_LAT = 12.9352;
const KORAMANGALA_LNG = 77.6245;

function initMap() {
  const mapEl = document.getElementById('dashboard-map');
  if (!mapEl || typeof L === 'undefined') return;

  // Clear any previous map instance
  if (dashboardMap) {
    dashboardMap.remove();
    dashboardMap = null;
  }

  dashboardMap = L.map('dashboard-map', {
    zoomControl: false,
    attributionControl: false,
  }).setView([KORAMANGALA_LAT, KORAMANGALA_LNG], 14);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(dashboardMap);

  // Complaint markers around Koramangala / Bangalore
  const markers = [
    { lat: 12.9356, lng: 77.6214, color: '#E8910C', radius: 12, label: '80 Feet Road Pothole' },
    { lat: 12.9410, lng: 77.6180, color: '#E8910C', radius: 8, label: 'Forum Mall Area' },
    { lat: 12.9716, lng: 77.6412, color: '#3B82F6', radius: 6, label: 'Indiranagar' },
    { lat: 12.9121, lng: 77.6446, color: '#16A34A', radius: 6, label: 'HSR Layout' },
    { lat: 12.9279, lng: 77.5839, color: '#16A34A', radius: 8, label: 'Jayanagar' },
    { lat: 12.9540, lng: 77.5985, color: '#E8910C', radius: 10, label: 'Cubbon Park' },
    { lat: 12.9250, lng: 77.6370, color: '#3B82F6', radius: 5, label: 'BTM Layout' },
  ];

  markers.forEach(m => {
    L.circleMarker([m.lat, m.lng], {
      radius: m.radius,
      fillColor: m.color,
      color: m.color,
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.5,
    }).bindTooltip(m.label, { direction: 'top', offset: [0, -8] })
      .addTo(dashboardMap);
  });

  // Custom map controls
  const zoomIn = document.getElementById('map-zoom-in');
  const zoomOut = document.getElementById('map-zoom-out');
  const locate = document.getElementById('map-locate');

  zoomIn?.addEventListener('click', () => dashboardMap.zoomIn());
  zoomOut?.addEventListener('click', () => dashboardMap.zoomOut());
  locate?.addEventListener('click', () => dashboardMap.setView([KORAMANGALA_LAT, KORAMANGALA_LNG], 14));
}

// Geocode search: uses Nominatim to fly the map to the searched place
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function handleSearchInput(query: string) {
  if (!dashboardMap) return;
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!query.trim()) return;

  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        dashboardMap.flyTo([parseFloat(lat), parseFloat(lon)], 15, { duration: 1.2 });
      }
    } catch (_e) {
      // silently fail on network error
    }
  }, 600);
}

// ============================================
// Report Issue Page (2-step Mobile Flow)
// ============================================
function renderReport(): string {
  const now = new Date();
  const timestampStr = now.toISOString().replace('T', ' ').substring(0, 23) + ' UTC';

  if (reportStep === 1) {
    return `
    <div class="report-mobile-header">
      <button class="back-btn" data-nav="ledger">←</button>
      <h2>Report Incident</h2>
      <div class="header-icon">⚡</div>
    </div>
    <div class="report-step1">
      <div class="camera-location-pill" id="location-pill">
        <span class="location-dot">📍</span> Auto-detecting location...
      </div>
      
      <div class="camera-viewfinder">
        <video id="video-stream" autoplay playsinline class="video-feed"></video>
        <canvas id="capture-canvas" style="display:none"></canvas>
        <div class="reticle top-left"></div>
        <div class="reticle top-right"></div>
        <div class="reticle bottom-left"></div>
        <div class="reticle bottom-right"></div>
      </div>
      
      <div class="camera-meta">
        <div class="meta-col">
          <label>LEDGER TIMESTAMP</label>
          <div id="camera-timestamp">${timestampStr}</div>
        </div>
        <div class="meta-col right">
          <label>VERIFICATION STATE</label>
          <div class="secure-badge">● SECURE CHANNEL</div>
        </div>
      </div>

      <div class="camera-controls">
        <div class="camera-icon">▦</div>
        <button class="capture-btn" id="take-photo-btn">
          <div class="capture-btn-inner"></div>
        </button>
        <div class="camera-icon">▤</div>
      </div>
      <div class="camera-hint">TAKE PHOTO</div>
      <div class="camera-footer">JANLEDGER CIVIC SOVEREIGNTY V2.4</div>
    </div>`;
  } else {
    const locationText = escapeHtml(reportGeo?.address || 'Detecting precise address...');
    const issueTitle = escapeHtml(reportAiExtraction?.title || (reportAiPending ? 'Analyzing uploaded image...' : 'Awaiting AI analysis'));
    const issueDescription = escapeHtml(reportAiExtraction?.description || 'AI will extract a consistent issue summary from your photo.');
    const issueCategory = escapeHtml(reportAiExtraction?.category || (reportAiPending ? 'Analyzing...' : 'Not available'));
    const issueSeverity = escapeHtml(reportAiExtraction?.severity || (reportAiPending ? 'Analyzing...' : 'Not available'));
    const issueKeywords = escapeHtml(reportAiExtraction?.keywords.join(', ') || (reportAiPending ? 'Extracting visual keywords...' : 'No keywords yet'));
    const routedAuthority = escapeHtml(reportAiExtraction ? routeAuthorityForCategory(reportAiExtraction.category) : 'Pending AI result');
    const aiErrorText = reportAiError ? escapeHtml(reportAiError) : null;
    const duplicateEntry = reportDuplicateMatchId ? findLedgerEntryById(reportDuplicateMatchId) : null;
    const duplicateTitle = duplicateEntry ? escapeHtml(duplicateEntry.title) : '';

    return `
    <div class="report-mobile-header">
      <button class="back-btn" id="back-to-step1">←</button>
      <h2>Report Incident</h2>
      <div class="header-step">STEP 2 OF 2</div>
    </div>
    <div class="report-step2">
      <div class="captured-photo-container">
        <img src="${capturedImage || '/images/pothole.png'}" alt="Captured Issue" class="captured-photo"/>
        <div class="photo-badge">📷 CAPTURED</div>
        <button class="edit-photo-btn">✏️</button>
      </div>

      <div class="report-section-header">
        <h3>AI Summary</h3>
        <span class="verified-badge">✓ VERIFIED ON BLOCKCHAIN</span>
      </div>

      ${
        reportAiPending
          ? '<div class="ai-analysis-state ai-analysis-loading">Analyzing image with Gemini model. Please wait...</div>'
          : ''
      }
      ${aiErrorText ? `<div class="ai-analysis-state ai-analysis-error">${aiErrorText}</div>` : ''}

      <div class="ai-summary-grid">
        <div class="ai-summary-card">
          <label>CATEGORY</label>
          <div>${issueCategory}</div>
        </div>
        <div class="ai-summary-card">
          <label>SEVERITY</label>
          <div>${issueSeverity}</div>
        </div>
        <div class="ai-summary-card" style="grid-column: span 2;">
          <label>TITLE</label>
          <div>${issueTitle}</div>
        </div>
        <div class="ai-summary-card" style="grid-column: span 2;">
          <label>ROUTED AUTHORITY</label>
          <div>${routedAuthority}</div>
        </div>
        <div class="ai-summary-card" style="grid-column: span 2;">
          <label>DESCRIPTION</label>
          <div>${issueDescription}</div>
        </div>
        <div class="ai-summary-card" style="grid-column: span 2;">
          <label>KEYWORDS</label>
          <div>${issueKeywords}</div>
        </div>
      </div>

      ${
        duplicateEntry
          ? `
      <div class="duplicate-match-banner">
        <p>A similar report has already been filed within ${DUPLICATE_RADIUS_METERS} metres.</p>
        <p class="duplicate-match-title">${duplicateTitle}</p>
        <div class="duplicate-actions">
          <button class="secondary" id="go-to-file-btn">GO TO FILE</button>
          <button class="primary" id="upvote-duplicate-btn">GO TO FILE AND UPVOTE</button>
        </div>
      </div>
      `
          : ''
      }

      <div class="location-detected-card">
        <span class="location-icon">📍</span>
        <div>
          <label>LOCATION DETECTED</label>
          <div id="final-location-text">${locationText}</div>
        </div>
      </div>

      <div class="report-section-header">
        <h3>Additional Details</h3>
        <span class="optional-label">Optional</span>
      </div>

      <div class="details-input-container">
        <textarea class="details-textarea" placeholder="Provide more context about the hazard..."></textarea>
        <div class="voice-to-text-row">
          <span>Voice-to-Text</span>
          <button class="mic-btn">🎤</button>
        </div>
      </div>

      <div class="privacy-notice">
        <span class="shield-icon">🛡️</span>
        <p>By submitting, your report will be anchored to the <strong>JanLedger Civic Chain</strong>. Metadata is anonymized by default to protect your privacy.</p>
      </div>

      <button class="submit-ledger-btn" id="submit-report-btn">
        ${duplicateEntry ? 'Use Existing Report' : 'Submit to Ledger →'}
      </button>
    </div>`;
  }
}

// --- Dynamic Report Logic ---

async function initCamera() {
  try {
    const video = document.getElementById('video-stream') as HTMLVideoElement;
    if (!video) return;

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    video.srcObject = cameraStream;
  } catch (err) {
    console.error('Camera Access Denied:', err);
    const viewfinder = document.querySelector('.camera-viewfinder');
    if (viewfinder) {
      viewfinder.innerHTML += '<div style="position:absolute; top:50%; width:100%; text-align:center; color:white;">Camera access required for verification</div>';
    }
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
}

function detectLocation() {
  const pill = document.getElementById('location-pill');
  const finalLocText = document.getElementById('final-location-text');

  if (!('geolocation' in navigator)) {
    if (pill) {
      pill.innerHTML = '<span class="location-dot">📍</span> Geolocation not available';
    }
    if (finalLocText) {
      finalLocText.textContent = 'Geolocation not available';
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const fallbackAddress = `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (auto-detected)`;
      reportGeo = { lat: latitude, lng: longitude, address: fallbackAddress };

      if (pill) {
        pill.innerHTML = `<span class="location-dot" style="color:var(--amber)">📍</span> ${fallbackAddress}`;
      }
      if (finalLocText) {
        finalLocText.textContent = fallbackAddress;
      }

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        const displayName = typeof data?.display_name === 'string' ? data.display_name : fallbackAddress;
        const shortAddress = displayName.split(',').slice(0, 3).join(',').trim() || displayName;
        reportGeo = { lat: latitude, lng: longitude, address: displayName };

        if (pill) {
          pill.innerHTML = `<span class="location-dot" style="color:var(--amber)">📍</span> ${shortAddress}`;
        }
        if (finalLocText) {
          finalLocText.textContent = displayName;
        }
      } catch {
        // Keep fallback address if reverse geocoding fails.
      }

      refreshDuplicateSuggestion();
      if (reportStep === 2) render();
    },
    () => {
      if (pill) {
        pill.innerHTML = '<span class="location-dot">📍</span> Location access denied';
      }
      if (finalLocText) {
        finalLocText.textContent = 'Location access denied';
      }
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function handleCapture() {
  const video = document.getElementById('video-stream') as HTMLVideoElement;
  const canvas = document.getElementById('capture-canvas') as HTMLCanvasElement;
  if (!video || !canvas) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedImage = canvas.toDataURL('image/png');
    reportAiExtraction = null;
    reportAiError = null;
    reportAiPending = true;
    reportDuplicateMatchId = null;
    stopCamera();
    reportStep = 2;
    render();
    detectLocation();
    void analyzeCapturedImage();
  }
}

function extractJsonObjectFromText(value: string): Record<string, unknown> | null {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function heuristicIssueFromImage(): ExtractedIssue {
  return {
    title: 'Civic issue reported by citizen',
    description: 'Citizen uploaded an image that indicates a civic issue requiring inspection.',
    category: 'Roads',
    keywords: ['civic issue', 'inspection required', 'reported hazard'],
    severity: 'Medium',
  };
}

async function requestGeminiIssueExtraction(imageDataUrl: string): Promise<ExtractedIssue> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is missing.');
  }

  const dataUrlParts = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!dataUrlParts) {
    throw new Error('Invalid image payload.');
  }

  const mimeType = dataUrlParts[1];
  const base64Data = dataUrlParts[2];
  const prompt = [
    'You are an AI system designed to analyze images of civic issues reported by citizens.',
    'Return ONLY valid JSON in this exact format:',
    '{',
    '  "title": "",',
    '  "description": "",',
    '  "category": "",',
    '  "keywords": [],',
    '  "severity": ""',
    '}',
    'Rules:',
    '- title: max 8 words',
    '- category must be one of: Roads, Water, Electricity, Sanitation, Traffic',
    '- severity must be one of: Low, Medium, High',
    '- Focus on the real-world issue shown',
    '- Ignore angle/lighting differences',
    '- Keep naming consistent for duplicates',
    '- No extra commentary outside JSON',
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  const extracted = extractJsonObjectFromText(text);
  return sanitizeExtractedIssue(extracted);
}

function refreshDuplicateSuggestion(): void {
  if (!reportAiExtraction || !reportGeo) {
    reportDuplicateMatchId = null;
    return;
  }

  const duplicate = findSimilarReport(reportAiExtraction, reportGeo.lat, reportGeo.lng);
  reportDuplicateMatchId = duplicate?.id ?? null;
}

async function analyzeCapturedImage(): Promise<void> {
  if (!capturedImage) return;

  reportAiPending = true;
  reportAiError = null;
  render();

  try {
    reportAiExtraction = await requestGeminiIssueExtraction(capturedImage);
    refreshDuplicateSuggestion();
  } catch (error) {
    reportAiExtraction = heuristicIssueFromImage();
    reportAiError =
      error instanceof Error
        ? `${error.message} Falling back to local extraction.`
        : 'Gemini extraction failed. Falling back to local extraction.';
    refreshDuplicateSuggestion();
  } finally {
    reportAiPending = false;
    render();
  }
}

function createLedgerEntryFromReport(issue: ExtractedIssue, location: { lat: number; lng: number; address: string }): LedgerEntry {
  const now = new Date();
  const id = `entry-${now.getTime()}`;
  const txHash = `0x${Math.random().toString(16).slice(2, 14)}${Math.random().toString(16).slice(2, 6)}`;
  const authority = routeAuthorityForCategory(issue.category);

  return {
    id,
    title: issue.title,
    description: issue.description,
    category: issue.category,
    keywords: issue.keywords,
    status: 'INVESTIGATING',
    statusColor: 'amber',
    severity: issue.severity,
    location: location.address,
    txHash,
    date: now.toLocaleDateString('en-IN'),
    events: [
      {
        text: `${issue.description}`,
        time: now.toLocaleString('en-IN'),
        color: 'green',
      },
      {
        text: `${authority} notified for ${issue.category.toLowerCase()} issue handling`,
        time: now.toLocaleString('en-IN'),
        color: 'blue',
      },
      {
        text: `20 Civic Credits awarded for verified report`,
        time: now.toLocaleString('en-IN'),
        color: 'amber',
      },
    ],
    guardianId: `CIV-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    coords: `${location.lat.toFixed(2)}°N, ${location.lng.toFixed(2)}°E`,
    lat: location.lat,
    lng: location.lng,
    upvotes: 1,
    image: capturedImage || '/images/building.png',
  };
}

function openDuplicateReport(entryId: string, alsoUpvote: boolean): void {
  const updated = alsoUpvote ? incrementReportUpvote(entryId) : findLedgerEntryById(entryId);
  selectedEntry = updated ?? findLedgerEntryById(entryId);
  reportStep = 1;
  reportAiPending = false;
  reportAiError = null;
  reportAiExtraction = null;
  reportDuplicateMatchId = null;
  capturedImage = null;
  navigate('detail');
}

async function handleReportSubmit(submitButton: HTMLElement): Promise<void> {
  if (!capturedImage) {
    submitButton.textContent = 'Capture photo first';
    return;
  }

  if (reportAiPending) {
    submitButton.textContent = 'AI analysis in progress...';
    return;
  }

  if (!reportAiExtraction) {
    reportAiPending = true;
    render();
    await analyzeCapturedImage();
  }

  if (!reportAiExtraction) {
    submitButton.textContent = 'Unable to read issue details';
    return;
  }

  const defaultLocation = {
    lat: KORAMANGALA_LAT,
    lng: KORAMANGALA_LNG,
    address: 'Koramangala, Bengaluru',
  };
  const location = reportGeo ?? defaultLocation;
  const duplicate = findSimilarReport(reportAiExtraction, location.lat, location.lng);

  if (duplicate) {
    openDuplicateReport(duplicate.id, true);
    return;
  }

  submitButton.textContent = 'Anchoring to Ledger...';
  submitButton.style.opacity = '0.7';

  const newEntry = createLedgerEntryFromReport(reportAiExtraction, location);
  ledgerEntries = [newEntry, ...ledgerEntries];
  saveLedgerEntries();

  reportStep = 1;
  reportAiPending = false;
  reportAiError = null;
  reportAiExtraction = null;
  reportDuplicateMatchId = null;
  capturedImage = null;
  reportGeo = null;

  navigate('ledger');
}

// ============================================
// Complaint Detail Page
// ============================================
function renderDetail(): string {
  const e = selectedEntry;
  // fallback data if no entry selected
  const title = e ? e.title : 'Broken Street Light';
  const category = e ? e.category : 'Electricity';
  const location = e ? e.location : 'North Avenue, Sector 4';
  const txHash = e ? e.txHash : '0x855300..f59e0b';
  const date = e ? e.date : '4/15/2026';
  const upvotes = e ? e.upvotes : 142;
  const guardianId = e ? e.guardianId : 'CIV-9A2F-K041';
  const coords = e ? e.coords : '12.93°N, 77.62°E';
  const severity = e ? e.severity : 'High';
  const status = e ? e.status : 'INVESTIGATING';
  const events = e ? e.events : [];

  // Determine image based on category
  const imgMap: Record<string, string> = {
    Roads: '/images/pothole.png',
    Water: '/images/building.png',
    Electricity: '/images/streetlight.png',
    Sanitation: '/images/building.png',
    Traffic: '/images/building.png',
  };
  const heroImg = imgMap[category] || '/images/streetlight.png';

  // Determine pipeline phase based on status
  let phase = 2;
  if (status === 'RESOLVED') phase = 5;
  else if (status === 'AUTHORITY NOTIFIED') phase = 3;
  else if (status === 'INVESTIGATING') phase = 2;

  const pipelineSteps = [
    { label: 'Submitted', icon: '✓' },
    { label: 'Under Review', icon: '✓' },
    { label: 'Assigned', icon: '👤' },
    { label: 'In Progress', icon: '🔧' },
    { label: 'Resolved', icon: '✓' },
  ];

  const pipelineHTML = pipelineSteps.map((step, i) => {
    const stepNum = i + 1;
    let cls = '';
    if (stepNum < phase) cls = 'completed';
    else if (stepNum === phase) cls = 'current';
    return `<div class="pipeline-step ${cls}">
      <div class="pipeline-dot">${cls === 'completed' ? '✓' : step.icon}</div>
      <span class="pipeline-label">${step.label}</span>
    </div>`;
  }).join('');

  // Generate ref ID from entry id
  const refId = e ? `#JL-${e.txHash.slice(2, 6).toUpperCase()}-${e.id.split('-')[1]?.toUpperCase() || 'X'}` : '#JL-8842-X';

  // Node activity from events
  const activityHTML = events.slice(0, 3).map(ev => `
    <div class="activity-item">
      <div class="activity-bar" style="background: ${ev.color === 'green' ? 'var(--info-green)' : ev.color === 'blue' ? 'var(--info-blue)' : ev.color === 'amber' ? 'var(--amber)' : '#DC2626'}"></div>
      <div class="activity-content">
        <h5>${ev.text}</h5>
        <p>${ev.time}</p>
      </div>
    </div>
  `).join('');

  // Authority note from last event
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const authorityNote = lastEvent ? lastEvent.text : 'Awaiting authority response.';

  return `
  <div class="detail-page">
    <div class="detail-layout">
      <!-- Left Content -->
      <div class="detail-left">
        <div class="detail-hero-image">
          <img src="${heroImg}" alt="${title}" />
          <div class="detail-hero-badge">Immutable Record</div>
        </div>

        <div class="detail-ref">
          <span class="detail-ref-id">REF: ${refId}</span>
          <span class="detail-ref-time">· ${date}</span>
        </div>

        <h1 class="detail-title">${title}</h1>

        <div class="detail-tags">
          <span class="detail-tag"><span class="tag-icon">🛡️</span> ${category}</span>
          <span class="detail-tag"><span class="tag-icon">📍</span> ${location}</span>
          <span class="detail-tag"><span class="tag-icon">⚠️</span> Severity ${severity}</span>
        </div>

        <!-- Resolution Pipeline -->
        <div class="detail-pipeline">
          <div class="detail-pipeline-header">
            <span class="detail-pipeline-title">Resolution Pipeline</span>
            <span class="detail-pipeline-phase">Phase ${String(phase).padStart(2, '0')}</span>
          </div>
          <div class="pipeline-track">
            ${pipelineHTML}
          </div>
        </div>

        <!-- Activity Cards -->
        <div class="detail-cards">
          <div class="detail-card">
            <h3 class="detail-card-title">Node Activity</h3>
            ${activityHTML}
          </div>
          <div class="detail-card">
            <h3 class="detail-card-title">Authority Note</h3>
            <p class="authority-note-text">${authorityNote}</p>
          </div>
        </div>
      </div>

      <!-- Right Sidebar -->
      <div class="detail-sidebar">
        <!-- Civic Action -->
        <div class="civic-action-card">
          <h2 class="civic-action-title">Civic Action</h2>
          <p class="civic-action-desc">Help prioritize this issue for the local council.</p>
          <button class="btn-support" id="support-btn">
            👍 Support this Report
          </button>
          <button class="btn-share">
            ↗ Share on Ledger
          </button>
          <div class="supporters-section">
            <div class="supporters-label">Supported by ${upvotes} People</div>
            <div class="supporters-avatars">
              <div class="supporter-avatar" style="background:#E8910C">AK</div>
              <div class="supporter-avatar" style="background:#3B82F6">MR</div>
              <div class="supporter-avatar" style="background:#16A34A">PS</div>
              <div class="supporter-avatar" style="background:#8B5CF6">TN</div>
              <div class="supporter-avatar more">+${Math.max(upvotes - 4, 0)}</div>
            </div>
          </div>
        </div>

        <!-- Location Mini Map -->
        <div class="detail-location-card">
          <div class="detail-location-label">${location}</div>
          <div class="detail-mini-map">
            <div class="detail-mini-map-inner"></div>
          </div>
        </div>

        <!-- Blockchain Info -->
        <div class="blockchain-card">
          <div class="blockchain-header">
            <span class="blockchain-title">Blockchain Integrity</span>
            <div class="blockchain-status-dot"></div>
          </div>
          <div class="blockchain-info">
            <div class="blockchain-row">
              <span class="blockchain-row-label">TX_ID:</span>
              <span class="blockchain-row-value">${txHash}</span>
            </div>
            <div class="blockchain-row">
              <span class="blockchain-row-label">BLOCK:</span>
              <span class="blockchain-row-value">14,882,902</span>
            </div>
            <div class="blockchain-row">
              <span class="blockchain-row-label">GUARDIAN:</span>
              <span class="blockchain-row-value">${guardianId}</span>
            </div>
            <div class="blockchain-row">
              <span class="blockchain-row-label">COORDS:</span>
              <span class="blockchain-row-value">${coords}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// ============================================
// Admin / Sovereign View
// ============================================
function renderAdmin(): string {
  return `
  <div class="admin-layout">
    ${renderSidebar('admin')}

    <!-- Main -->
    <div style="flex:1;display:flex;flex-direction:column;overflow-y:auto">
      <div class="admin-main">
        <!-- Top -->
        <div class="admin-top">
          <div>
            <h1 class="admin-page-title">Public Complaints</h1>
            <p class="admin-page-subtitle">Systemic oversight of civil infrastructure requests and legislative compliance reports. Filtered by sovereign priority.</p>
          </div>
          <div class="admin-stats">
            <div class="admin-stat-box">
              <div class="admin-stat-label">Active Cases</div>
              <div class="admin-stat-number">1,284</div>
            </div>
            <div class="admin-stat-box">
              <div class="admin-stat-label">Resolved (24h)</div>
              <div class="admin-stat-number">42</div>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="admin-filters">
          <div class="admin-filter-left">
            <span class="admin-filter-label">Priority Filter</span>
            <button class="admin-filter-btn active">All Priority</button>
            <button class="admin-filter-btn">High</button>
            <button class="admin-filter-btn">Medium</button>
          </div>
          <div class="admin-filter-right">
            <div class="admin-jurisdiction">
              <span class="admin-jurisdiction-label">Jurisdiction</span>
              <span>Metropolitan Central</span>
            </div>
            <button class="admin-filter-btn">
              ☰ Advanced Sorting
            </button>
            <button class="btn-audit">
              📊 Generate Sovereign Audit
            </button>
          </div>
        </div>

        <!-- Table -->
        <div class="admin-table">
          <div class="admin-table-header">
            <span>Issue & Reference</span>
            <span>Location</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Administrative Actions</span>
          </div>
          ${renderAdminRow('Grid Destabilization in Sector 7', 'JL-2024-0081', 'Koramangala 5th Block', 248, 'critical', 'Critical')}
          ${renderAdminRow('Water Filtration Protocol Delay', 'JL-2024-0092', 'HSR Layout, Sector 3', 112, 'processing', 'Processing')}
          ${renderAdminRow('Automated Transit Lane Obstruction', 'JL-2024-0105', 'Outer Ring Road, Bellandur', 45, 'scheduled', 'Scheduled')}
        </div>

        <!-- Pagination -->
        <div class="admin-pagination">
          <span class="admin-pagination-info">Showing 1-15 of 1,284 entries</span>
          <div class="admin-pagination-controls">
            <button class="admin-page-btn">‹</button>
            <button class="admin-page-btn active">1</button>
            <button class="admin-page-btn">2</button>
            <button class="admin-page-btn">3</button>
            <button class="admin-page-btn">›</button>
          </div>
        </div>

        <!-- Insight Section -->
        <div class="admin-insight-section">
          <div class="admin-insight-card">
            <h3 class="admin-insight-title">Registry Insight</h3>
            <div class="insight-item">
              <div class="insight-dot red"></div>
              <div class="insight-content">
                <h5>Emergency Response Spike</h5>
                <p>System noted 15% increase in sector 7 issues over last 6 hours.</p>
              </div>
            </div>
            <div class="insight-item">
              <div class="insight-dot amber"></div>
              <div class="insight-content">
                <h5>Budget Optimization</h5>
                <p>Maintenance allocation for Q3 has been verified by the audit committee.</p>
              </div>
            </div>
          </div>
          <div class="admin-map-card">
            <div class="admin-map-bg"></div>
            <div class="admin-map-overlay">
              <div class="admin-map-badge">Live Incident Map</div>
              <div class="admin-map-critical">12 Critical Incidents</div>
            </div>
            <div class="admin-map-expand">Expand Map View ↗</div>
          </div>
        </div>
      </div>

      <!-- Admin Footer -->
      <footer class="admin-footer">
        <span class="admin-footer-brand">JANLEDGER INSTITUTION</span>
        <div class="admin-footer-links">
          <a href="#">Transparency</a>
          <a href="#">Privacy</a>
          <a href="#">Public Data</a>
          <a href="#">Terms</a>
        </div>
        <span class="admin-footer-copy">© 2024 JANLEDGER SOVEREIGN INSTITUTION</span>
      </footer>
    </div>
  </div>`;
}

function renderAdminRow(name: string, ref: string, location: string, upvotes: number, status: string, statusLabel: string): string {
  return `
  <div class="admin-table-row" data-nav="detail">
    <div>
      <div class="admin-issue-name">${name}</div>
      <div class="admin-issue-ref">REF: ${ref}</div>
    </div>
    <div class="admin-location">${location}</div>
    <div class="admin-priority">
      <span class="admin-priority-icon">▲</span>
      <span class="admin-priority-count">${upvotes}</span>
      <span class="admin-priority-label">Upvotes</span>
    </div>
    <div>
      <span class="status-badge ${status}">${statusLabel}</span>
    </div>
    <div class="admin-actions">
      <button class="admin-action-btn" title="Assign">👤</button>
      <button class="admin-action-btn" title="Transfer">⇄</button>
      <button class="admin-action-btn" title="Archive">📁</button>
    </div>
  </div>`;
}

// ============================================
// Public Ledger Page (Twitter-style feed)
// ============================================
function renderLedger(): string {
  const entries = getLedgerEntries();
  const totalEntries = entries.length;
  const activeEntries = entries.filter((entry) => entry.status !== 'RESOLVED').length;
  const resolvedEntries = entries.filter((entry) => entry.status === 'RESOLVED').length;
  return `
  <div class="ledger-page">
    <!-- Header -->
    <div class="ledger-header">
      <div class="ledger-badge">📋 Public Transparency Layer</div>
      <h1 class="ledger-heading">Public Audit Ledger</h1>
      <p class="ledger-subtitle">Immutable record of every report, trace, credit, and authority action.<br>Transparent but anonymous — authorities cannot suppress reports.</p>
    </div>

    <!-- Stats -->
    <div class="ledger-stats">
      <div class="ledger-stat-card">
        <div class="ledger-stat-number">${totalEntries}</div>
        <div class="ledger-stat-label">Total Entries</div>
      </div>
      <div class="ledger-stat-card">
        <div class="ledger-stat-number ledger-stat-amber">${activeEntries}</div>
        <div class="ledger-stat-label">Active Investigations</div>
      </div>
      <div class="ledger-stat-card">
        <div class="ledger-stat-number ledger-stat-green">${resolvedEntries}</div>
        <div class="ledger-stat-label">Resolved</div>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="ledger-filter-bar">
      <div class="ledger-search">
        <span class="ledger-search-icon">🔍</span>
        <input type="text" placeholder="Search by title or hash..." id="ledger-search-input" />
      </div>
      <div class="ledger-filter-tabs">
        <button class="ledger-tab active" data-filter="all">All</button>
        <button class="ledger-tab" data-filter="investigating">Investigating</button>
        <button class="ledger-tab" data-filter="authority">Authority Notified</button>
        <button class="ledger-tab" data-filter="resolved">Resolved</button>
        <button class="ledger-tab" data-filter="embed">&lt;/&gt; Embed</button>
      </div>
    </div>

    <!-- Entries Feed -->
    <div class="ledger-feed" id="ledger-feed">
      ${entries.map(e => renderLedgerEntry(e)).join('')}
    </div>

    <!-- Load More -->
    <div class="ledger-load-more">
      <button class="btn-secondary" id="ledger-load-more-btn">Load Older Entries</button>
    </div>
  </div>`;
}

type ReportCategory = 'Roads' | 'Water' | 'Electricity' | 'Sanitation' | 'Traffic';
type Severity = 'Low' | 'Medium' | 'High';

interface ExtractedIssue {
  title: string;
  description: string;
  category: ReportCategory;
  keywords: string[];
  severity: Severity;
}

interface LedgerEvent {
  text: string;
  time: string;
  color: 'green' | 'blue' | 'amber' | 'red';
}

interface LedgerEntry {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  keywords: string[];
  status: string;
  statusColor: string;
  severity: Severity;
  location: string;
  txHash: string;
  date: string;
  events: LedgerEvent[];
  guardianId: string;
  coords: string;
  lat: number;
  lng: number;
  upvotes: number;
  image?: string;
}

function normalizeKeyword(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeCategory(value: string): ReportCategory {
  const candidate = value.trim().toLowerCase();
  if (candidate.includes('water') || candidate.includes('sewage') || candidate.includes('pipe')) return 'Water';
  if (candidate.includes('electric') || candidate.includes('light') || candidate.includes('power')) return 'Electricity';
  if (candidate.includes('sanitation') || candidate.includes('garbage') || candidate.includes('waste')) return 'Sanitation';
  if (candidate.includes('traffic') || candidate.includes('signal') || candidate.includes('congestion')) return 'Traffic';
  return 'Roads';
}

function normalizeSeverity(value: string): Severity {
  const candidate = value.trim().toLowerCase();
  if (candidate === 'high') return 'High';
  if (candidate === 'medium') return 'Medium';
  return 'Low';
}

function routeAuthorityForCategory(category: ReportCategory): string {
  if (category === 'Water') return 'BWSSB';
  if (category === 'Electricity') return 'BESCOM';
  if (category === 'Traffic') return 'Traffic Police';
  return 'BBMP';
}

function sanitizeExtractedIssue(raw: unknown): ExtractedIssue {
  if (!raw || typeof raw !== 'object') {
    return {
      title: 'Civic issue detected from image',
      description: 'Citizen uploaded an issue image requiring field verification.',
      category: 'Roads',
      keywords: ['civic issue', 'field verification', 'reported hazard'],
      severity: 'Medium',
    };
  }

  const candidate = raw as Record<string, unknown>;
  const title = typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim().slice(0, 64) : 'Civic issue detected from image';
  const description =
    typeof candidate.description === 'string' && candidate.description.trim()
      ? candidate.description.trim().slice(0, 220)
      : 'Citizen uploaded an issue image requiring field verification.';
  const category = normalizeCategory(typeof candidate.category === 'string' ? candidate.category : 'Roads');
  const severity = normalizeSeverity(typeof candidate.severity === 'string' ? candidate.severity : 'Medium');
  const keywordsSource = Array.isArray(candidate.keywords) ? candidate.keywords : [];
  const normalizedKeywords = keywordsSource
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => normalizeKeyword(entry))
    .filter((entry) => entry.length > 0)
    .slice(0, 5);

  return {
    title,
    description,
    category,
    keywords: normalizedKeywords.length > 0 ? normalizedKeywords : [normalizeKeyword(category), 'civic issue', 'reported hazard'],
    severity,
  };
}

function sanitizeLedgerEntry(raw: unknown): LedgerEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string') return null;

  const category = normalizeCategory(typeof candidate.category === 'string' ? candidate.category : 'Roads');
  const severity = normalizeSeverity(typeof candidate.severity === 'string' ? candidate.severity : 'Medium');
  const keywords = Array.isArray(candidate.keywords)
    ? candidate.keywords
        .filter((item): item is string => typeof item === 'string')
        .map((item) => normalizeKeyword(item))
        .filter((item) => item.length > 0)
    : [normalizeKeyword(category), 'civic issue'];

  const lat = typeof candidate.lat === 'number' ? candidate.lat : 12.9352;
  const lng = typeof candidate.lng === 'number' ? candidate.lng : 77.6245;

  return {
    id: candidate.id,
    title: candidate.title,
    description: typeof candidate.description === 'string' ? candidate.description : 'Citizen reported civic issue.',
    category,
    keywords: keywords.slice(0, 5),
    status: typeof candidate.status === 'string' ? candidate.status : 'INVESTIGATING',
    statusColor: typeof candidate.statusColor === 'string' ? candidate.statusColor : 'amber',
    severity,
    location: typeof candidate.location === 'string' ? candidate.location : 'Bengaluru',
    txHash: typeof candidate.txHash === 'string' ? candidate.txHash : `0x${Math.random().toString(16).slice(2, 14)}`,
    date: typeof candidate.date === 'string' ? candidate.date : new Date().toLocaleDateString('en-IN'),
    events: Array.isArray(candidate.events)
      ? candidate.events.filter((event): event is LedgerEvent => {
          if (!event || typeof event !== 'object') return false;
          const eventRecord = event as Record<string, unknown>;
          return (
            typeof eventRecord.text === 'string' &&
            typeof eventRecord.time === 'string' &&
            (eventRecord.color === 'green' || eventRecord.color === 'blue' || eventRecord.color === 'amber' || eventRecord.color === 'red')
          );
        })
      : [],
    guardianId: typeof candidate.guardianId === 'string' ? candidate.guardianId : 'CIV-LOCAL-NODE',
    coords: typeof candidate.coords === 'string' ? candidate.coords : `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`,
    lat,
    lng,
    upvotes: typeof candidate.upvotes === 'number' ? Math.max(1, Math.round(candidate.upvotes)) : 1,
    image: typeof candidate.image === 'string' ? candidate.image : undefined,
  };
}

function getSeedLedgerEntries(): LedgerEntry[] {
  return [
    {
      id: 'entry-1',
      title: 'Severe pothole cluster reported on 80 Feet Road',
      description: 'Multiple deep potholes on the same corridor are affecting two-wheeler and car safety.',
      category: 'Roads',
      keywords: ['pothole', 'road damage', 'asphalt break', 'traffic risk'],
      status: 'RESOLVED',
      statusColor: 'green',
      severity: 'High',
      location: 'Koramangala 4th Block',
      txHash: '0xa3f7e2c1d9b4',
      date: '4/15/2026',
      events: [
        { text: 'Pothole depth measured at 18cm — verified by 3 citizen nodes', time: '4/15/2026, 10:30:00 AM', color: 'green' },
        { text: 'Bruhat Bengaluru Mahanagara Palike (BBMP) Roads Division notified', time: '4/15/2026, 10:35:00 AM', color: 'blue' },
        { text: '75 Civic Credits awarded to reporter', time: '4/15/2026, 10:37:00 AM', color: 'amber' },
        { text: 'Road resurfacing completed by BBMP contractor', time: '4/15/2026, 4:20:00 PM', color: 'green' },
      ],
      guardianId: 'CIV-9A2F-K041',
      coords: '12.93°N, 77.62°E',
      lat: 12.9356,
      lng: 77.6214,
      upvotes: 124,
      image: '/images/pothole.png',
    },
    {
      id: 'entry-2',
      title: 'Broken street light creating safety hazard near metro station',
      description: 'A dark stretch near the metro feeder path is unsafe for pedestrians after sunset.',
      category: 'Electricity',
      keywords: ['streetlight', 'power fault', 'dark zone', 'night safety'],
      status: 'INVESTIGATING',
      statusColor: 'amber',
      severity: 'Medium',
      location: 'Indiranagar, 100 Feet Road',
      txHash: '0xb8d4f5a9e170',
      date: '4/14/2026',
      events: [
        { text: 'Dark zone confirmed — 200m stretch without illumination', time: '4/14/2026, 8:50:00 PM', color: 'green' },
        { text: 'Bangalore Electricity Supply Company (BESCOM) alerted for electrical faults', time: '4/14/2026, 8:55:00 PM', color: 'blue' },
        { text: '25 Civic Credits awarded', time: '4/14/2026, 8:52:00 PM', color: 'amber' },
      ],
      guardianId: 'CIV-4E8D-B135',
      coords: '12.97°N, 77.64°E',
      lat: 12.9716,
      lng: 77.6412,
      upvotes: 89,
      image: '/images/streetlight.png',
    },
    {
      id: 'entry-3',
      title: 'Illegal garbage dump growing near Agara Lake boundary',
      description: 'Open garbage pile has expanded and is blocking pedestrian movement near the lake side.',
      category: 'Sanitation',
      keywords: ['garbage', 'waste dump', 'sanitation', 'odor'],
      status: 'AUTHORITY NOTIFIED',
      statusColor: 'blue',
      severity: 'High',
      location: 'HSR Layout, Sector 2',
      txHash: '0xc2e6a8d3f412',
      date: '4/13/2026',
      events: [
        { text: 'Waste spread measured at ~400 sqm — photo evidence hashed', time: '4/13/2026, 7:15:00 AM', color: 'green' },
        { text: 'Bruhat Bengaluru Mahanagara Palike (BBMP) Garbage Collection notified', time: '4/13/2026, 7:20:00 AM', color: 'blue' },
        { text: 'Karnataka State Pollution Control Board environmental alert flagged', time: '4/13/2026, 7:25:00 AM', color: 'red' },
        { text: '100 Civic Credits awarded to reporter', time: '4/13/2026, 7:22:00 AM', color: 'amber' },
        { text: 'Cleanup drive scheduled by BBMP for 4/16/2026', time: '4/14/2026, 2:00:00 PM', color: 'blue' },
      ],
      guardianId: 'CIV-7C1A-H592',
      coords: '12.91°N, 77.64°E',
      lat: 12.9121,
      lng: 77.6446,
      upvotes: 231,
      image: '/images/building.png',
    },
    {
      id: 'entry-4',
      title: 'Water pipeline leak causing road erosion on CMH Road',
      description: 'Leaking pipeline water has started eating into the asphalt shoulder near the carriageway.',
      category: 'Water',
      keywords: ['water leak', 'pipeline', 'road erosion', 'seepage'],
      status: 'INVESTIGATING',
      statusColor: 'amber',
      severity: 'High',
      location: 'Indiranagar, Near Metro',
      txHash: '0xd9f1b3c5e728',
      date: '4/12/2026',
      events: [
        { text: 'Continuous water flow detected — eroding asphalt layer', time: '4/12/2026, 11:40:00 AM', color: 'green' },
        { text: 'Bangalore Water Supply and Sewerage Board (BWSSB) emergency division contacted', time: '4/12/2026, 11:45:00 AM', color: 'blue' },
        { text: '50 Civic Credits awarded', time: '4/12/2026, 11:42:00 AM', color: 'amber' },
      ],
      guardianId: 'CIV-3F5B-M287',
      coords: '12.97°N, 77.64°E',
      lat: 12.9698,
      lng: 77.6402,
      upvotes: 67,
      image: '/images/building.png',
    },
    {
      id: 'entry-5',
      title: 'Overflowing storm drain flooding park entrance',
      description: 'Storm water drain overflow is spilling onto the park entry footpath during non-rain hours.',
      category: 'Water',
      keywords: ['storm drain', 'flooding', 'overflow', 'footpath'],
      status: 'RESOLVED',
      statusColor: 'green',
      severity: 'Medium',
      location: 'Cubbon Park, MG Road',
      txHash: '0xe4a2d6f8b391',
      date: '4/11/2026',
      events: [
        { text: 'Drain blockage confirmed — overflow into park pathway', time: '4/11/2026, 6:30:00 AM', color: 'green' },
        { text: 'Bruhat Bengaluru Mahanagara Palike (BBMP) Storm Water Drain dept dispatched', time: '4/11/2026, 6:40:00 AM', color: 'blue' },
        { text: '40 Civic Credits awarded', time: '4/11/2026, 6:35:00 AM', color: 'amber' },
        { text: 'Drain cleared and pathway restored by BBMP', time: '4/11/2026, 3:15:00 PM', color: 'green' },
      ],
      guardianId: 'CIV-2D8E-C463',
      coords: '12.97°N, 77.59°E',
      lat: 12.954,
      lng: 77.5985,
      upvotes: 156,
      image: '/images/building.png',
    },
    {
      id: 'entry-6',
      title: 'Missing manhole cover on service road near Forum Mall',
      description: 'Open manhole without barricading creates high risk for riders and pedestrians.',
      category: 'Roads',
      keywords: ['manhole', 'open pit', 'road hazard', 'pedestrian risk'],
      status: 'RESOLVED',
      statusColor: 'green',
      severity: 'High',
      location: 'Koramangala, Forum Mall Road',
      txHash: '0xf7c3e9a1d584',
      date: '4/10/2026',
      events: [
        { text: 'Open manhole verified — extreme pedestrian risk', time: '4/10/2026, 9:00:00 AM', color: 'red' },
        { text: 'Emergency barricade placed by Bangalore Traffic Police (BTP)', time: '4/10/2026, 9:15:00 AM', color: 'blue' },
        { text: 'Bruhat Bengaluru Mahanagara Palike (BBMP) infrastructure team deployed', time: '4/10/2026, 9:30:00 AM', color: 'blue' },
        { text: '150 Civic Credits awarded for critical report', time: '4/10/2026, 9:05:00 AM', color: 'amber' },
        { text: 'New reinforced cover installed and inspected by BBMP', time: '4/10/2026, 5:00:00 PM', color: 'green' },
      ],
      guardianId: 'CIV-8A4F-K718',
      coords: '12.93°N, 77.62°E',
      lat: 12.9352,
      lng: 77.6245,
      upvotes: 312,
      image: '/images/pothole.png',
    },
  ];
}

function loadLedgerEntries(): LedgerEntry[] {
  try {
    const raw = localStorage.getItem(ledgerStorageKey);
    if (!raw) return getSeedLedgerEntries();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getSeedLedgerEntries();
    const list = parsed.map(sanitizeLedgerEntry).filter((entry): entry is LedgerEntry => entry !== null);
    return list.length > 0 ? list : getSeedLedgerEntries();
  } catch {
    return getSeedLedgerEntries();
  }
}

function saveLedgerEntries(): void {
  localStorage.setItem(ledgerStorageKey, JSON.stringify(ledgerEntries));
}

function getLedgerEntries(): LedgerEntry[] {
  return ledgerEntries;
}

function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}

function keywordOverlapScore(first: string[], second: string[]): number {
  const a = new Set(first.map((item) => normalizeKeyword(item)).filter((item) => item.length > 0));
  const b = new Set(second.map((item) => normalizeKeyword(item)).filter((item) => item.length > 0));
  if (a.size === 0 || b.size === 0) return 0;

  let overlap = 0;
  a.forEach((item) => {
    if (b.has(item)) overlap += 1;
  });

  return overlap / Math.max(a.size, b.size);
}

function findLedgerEntryById(entryId: string): LedgerEntry | null {
  return ledgerEntries.find((entry) => entry.id === entryId) ?? null;
}

function updateLedgerEntry(entryId: string, updater: (entry: LedgerEntry) => LedgerEntry): LedgerEntry | null {
  const index = ledgerEntries.findIndex((entry) => entry.id === entryId);
  if (index === -1) return null;
  const updatedEntry = updater(ledgerEntries[index]);
  ledgerEntries = [
    ...ledgerEntries.slice(0, index),
    updatedEntry,
    ...ledgerEntries.slice(index + 1),
  ];
  saveLedgerEntries();
  return updatedEntry;
}

function incrementReportUpvote(entryId: string): LedgerEntry | null {
  return updateLedgerEntry(entryId, (entry) => ({ ...entry, upvotes: entry.upvotes + 1 }));
}

function findSimilarReport(issue: ExtractedIssue, lat: number, lng: number): LedgerEntry | null {
  const nearby = ledgerEntries.filter((entry) => {
    const distance = haversineDistanceMeters(lat, lng, entry.lat, entry.lng);
    return distance <= DUPLICATE_RADIUS_METERS;
  });

  let bestMatch: { entry: LedgerEntry; score: number } | null = null;

  for (const entry of nearby) {
    if (normalizeCategory(entry.category) !== normalizeCategory(issue.category)) continue;

    const entryKeywords = entry.keywords.length > 0 ? entry.keywords : [entry.category, entry.title];
    const overlap = keywordOverlapScore(entryKeywords, issue.keywords);
    const titleOverlap = keywordOverlapScore(entry.title.split(' '), issue.title.split(' '));
    const distanceScore = 1 - Math.min(1, haversineDistanceMeters(lat, lng, entry.lat, entry.lng) / DUPLICATE_RADIUS_METERS);
    const score = overlap * 0.55 + titleOverlap * 0.25 + distanceScore * 0.2;

    if (score >= 0.35 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { entry, score };
    }
  }

  return bestMatch?.entry ?? null;
}

function renderLedgerEntry(entry: LedgerEntry): string {
  return `
  <div class="ledger-entry" data-entry-id="${entry.id}">
    <div class="ledger-entry-header">
      <div class="ledger-entry-checkbox">
        <span class="ledger-upvote-icon" data-upvote="${entry.id}">▲</span>
      </div>
      <div class="ledger-entry-title-area">
        <h3 class="ledger-entry-title">${entry.title}</h3>
        <div class="ledger-entry-tags">
          <span class="ledger-tag ledger-tag-category">${entry.category}</span>
          <span class="ledger-tag ledger-tag-status ledger-tag-${entry.statusColor}">${entry.status}</span>
          <span class="ledger-tag ledger-tag-severity">SEVERITY ${entry.severity}</span>
          <span class="ledger-entry-location">${entry.location}</span>
        </div>
      </div>
      <div class="ledger-entry-meta">
        <span class="ledger-entry-hash">${entry.txHash}</span>
        <span class="ledger-entry-date">⏱ ${entry.date}</span>
      </div>
    </div>
    <div class="ledger-entry-timeline">
      ${entry.events.map(ev => `
        <div class="ledger-timeline-item">
          <div class="ledger-timeline-dot ledger-dot-${ev.color}"></div>
          <div class="ledger-timeline-content">
            <span class="ledger-timeline-text">${ev.text}</span>
            <span class="ledger-timeline-time">${ev.time}</span>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="ledger-entry-footer">
      <div class="ledger-entry-guardian">
        <span class="ledger-guardian-icon">◇</span>
        Guardian: <span class="ledger-guardian-id">${entry.guardianId}</span>
      </div>
      <div class="ledger-entry-stats">
        <span class="ledger-entry-upvotes">▲ ${entry.upvotes} upvotes</span>
        <span class="ledger-entry-coords">${entry.coords}</span>
      </div>
    </div>
  </div>`;
}

// ============================================
// Footer
// ============================================
function renderFooter(): string {
  return `
  <footer class="footer">
    <div>
      <div class="footer-brand">JanLedger</div>
      <div class="footer-copy">© 2024 JANLEDGER. IMMUTABLE CIVIC TRANSPARENCY.</div>
    </div>
    <div class="footer-links">
      <a href="#">Privacy Policy</a>
      <a href="#">Blockchain Nodes</a>
      <a href="#">Open Data API</a>
      <a href="#">Contact Authority</a>
    </div>
  </footer>`;
}

// ============================================
// Event Listeners
// ============================================
function attachListeners() {
  // Navigation
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const route = (el as HTMLElement).dataset.nav as Route;
      navigate(route);
    });
  });

  // Search → geocode → move map
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      handleSearchInput(searchInput.value);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearchInput(searchInput.value);
      }
    });
  }

  // File upload
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
  if (uploadZone && fileInput) {
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        const uploadText = uploadZone.querySelector('.report-upload-text');
        const uploadHint = uploadZone.querySelector('.report-upload-hint');
        if (uploadText) uploadText.textContent = fileName;
        if (uploadHint) uploadHint.textContent = 'File selected ✓';
        uploadZone.style.borderColor = 'var(--info-green)';
        uploadZone.style.background = 'var(--info-green-bg)';
      }
    });
  }

  // Auto-detect location
  const autoDetect = document.getElementById('auto-detect-btn');
  if (autoDetect) {
    autoDetect.addEventListener('click', () => {
      autoDetect.textContent = '⊙ Detecting...';
      autoDetect.style.borderColor = 'var(--amber)';
      autoDetect.style.background = 'var(--amber-light)';
      setTimeout(() => {
        autoDetect.textContent = '✓ Location Detected';
        autoDetect.style.borderColor = 'var(--info-green)';
        autoDetect.style.background = 'var(--info-green-bg)';
        autoDetect.style.color = 'var(--info-green)';
      }, 1500);
    });
  }

  // Support button
  const supportBtn = document.getElementById('support-btn');
  if (supportBtn) {
    supportBtn.addEventListener('click', () => {
      if (!selectedEntry) return;
      const updated = incrementReportUpvote(selectedEntry.id);
      if (updated) {
        selectedEntry = updated;
        render();
      }
    });
  }

  // Admin filter buttons
  document.querySelectorAll('.admin-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const parent = btn.closest('.admin-filter-left');
      if (parent) {
        parent.querySelectorAll('.admin-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });

  // Sidebar items
  document.querySelectorAll('.sidebar-item:not([data-nav])').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // Admin pagination
  document.querySelectorAll('.admin-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-page-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Ledger filter tabs
  document.querySelectorAll('.ledger-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ledger-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const filter = (tab as HTMLElement).dataset.filter;
      const entries = document.querySelectorAll('.ledger-entry');
      entries.forEach(entry => {
        const el = entry as HTMLElement;
        if (filter === 'all') {
          el.style.display = '';
        } else if (filter === 'resolved') {
          el.style.display = el.querySelector('.ledger-tag-green') ? '' : 'none';
        } else if (filter === 'investigating') {
          el.style.display = el.querySelector('.ledger-tag-amber') ? '' : 'none';
        } else if (filter === 'authority') {
          el.style.display = el.querySelector('.ledger-tag-blue') ? '' : 'none';
        } else {
          el.style.display = '';
        }
      });
    });
  });

  // Ledger search
  const ledgerSearch = document.getElementById('ledger-search-input') as HTMLInputElement | null;
  if (ledgerSearch) {
    ledgerSearch.addEventListener('input', () => {
      const q = ledgerSearch.value.toLowerCase();
      document.querySelectorAll('.ledger-entry').forEach(entry => {
        const el = entry as HTMLElement;
        const text = el.textContent?.toLowerCase() || '';
        el.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }

  // Ledger upvote buttons
  document.querySelectorAll('.ledger-upvote-icon').forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const el = btn as HTMLElement;
      const entryId = el.dataset.upvote;
      if (!entryId) return;
      incrementReportUpvote(entryId);
      render();
    });
  });

  // Ledger entry click -> detail view
  document.querySelectorAll('.ledger-entry').forEach((entryElement) => {
    entryElement.addEventListener('click', () => {
      const id = (entryElement as HTMLElement).dataset.entryId;
      if (!id) return;
      const entry = findLedgerEntryById(id);
      if (!entry) return;
      selectedEntry = entry;
      navigate('detail');
    });
  });

  // Mobile nav switching
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const navItem = item as HTMLElement;
      if (navItem.dataset.nav) {
        navigate(navItem.dataset.nav as Route);
      }
    });
  });

  // Report Step 1 -> Step 2
  const takePhotoBtn = document.getElementById('take-photo-btn');
  if (takePhotoBtn) {
    takePhotoBtn.addEventListener('click', () => {
      handleCapture();
    });
  }

  // Auto-init for report page
  if (currentRoute === 'report') {
    if (reportStep === 1) {
      initCamera();
      detectLocation();
    }
  }

  // Report Step 2 -> Back to Step 1
  const backStepBtn = document.getElementById('back-to-step1');
  if (backStepBtn) {
    backStepBtn.addEventListener('click', () => {
      reportStep = 1;
      reportAiPending = false;
      reportAiError = null;
      reportAiExtraction = null;
      reportDuplicateMatchId = null;
      capturedImage = null;
      reportGeo = null;
      render();
    });
  }

  const goToFileBtn = document.getElementById('go-to-file-btn');
  if (goToFileBtn) {
    goToFileBtn.addEventListener('click', () => {
      if (!reportDuplicateMatchId) return;
      openDuplicateReport(reportDuplicateMatchId, false);
    });
  }

  const upvoteDuplicateBtn = document.getElementById('upvote-duplicate-btn');
  if (upvoteDuplicateBtn) {
    upvoteDuplicateBtn.addEventListener('click', () => {
      if (!reportDuplicateMatchId) return;
      openDuplicateReport(reportDuplicateMatchId, true);
    });
  }

  // Report Step 2 Submit
  const submitReportBtn = document.getElementById('submit-report-btn');
  if (submitReportBtn) {
    submitReportBtn.addEventListener('click', async () => {
      await handleReportSubmit(submitReportBtn);
    });
  }
}

// ============================================
// Initialize
// ============================================
ledgerEntries = loadLedgerEntries();
render();
