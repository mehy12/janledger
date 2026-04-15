import './style.css';

// ============================================
// JanLedger — SPA Router & Application
// ============================================

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
type Route = 'landing' | 'overview' | 'map' | 'feed' | 'portal' | 'settings' | 'report' | 'detail' | 'admin';

let currentRoute: Route = 'landing';

function navigate(route: Route) {
  if (currentRoute === 'report' && route !== 'report') {
    stopCamera();
  }
  currentRoute = route;
  render();
  window.scrollTo(0, 0);
}

function render() {
  switch (currentRoute) {
    case 'landing':
      app.innerHTML = renderNav('Explore') + renderLanding() + renderFooter() + renderMobileNav('Feed');
      break;
    case 'overview':
      app.innerHTML = renderAppLayout(renderOverview(), 'overview');
      initMap('overview-map');
      break;
    case 'map':
      app.innerHTML = renderAppLayout(renderMapPage(), 'map');
      initMap('full-map');
      break;
    case 'feed':
      app.innerHTML = renderAppLayout(renderLedger(), 'feed');
      break;
    case 'portal':
      app.innerHTML = renderAppLayout(renderPortal(), 'portal');
      break;
    case 'settings':
      app.innerHTML = renderAppLayout(renderSettings(), 'settings');
      break;
    case 'report':
      app.innerHTML = renderReport() + renderMobileNav('Report');
      break;
    case 'detail':
      app.innerHTML = renderNav('Report') + renderDetail() + renderFooter() + renderMobileNav('Feed');
      break;
    case 'admin':
      app.innerHTML = renderAppLayout(renderAdmin(), 'portal');
      break;
  }
  attachListeners();
}

function renderAppLayout(content: string, activeItem: string): string {
  return `
    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="app-sidebar">
        <div class="sidebar-brand">
          <div class="brand-logo">🏛️</div>
          <div class="brand-info">
            <div class="brand-name">Civic Sovereignty</div>
            <div class="brand-ver">Digital Architect v1.0</div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <div class="sidebar-nav-item ${activeItem === 'overview' ? 'active' : ''}" data-nav="overview">
            <span class="sidebar-nav-icon">📊</span> Overview
          </div>
          <div class="sidebar-nav-item ${activeItem === 'map' ? 'active' : ''}" data-nav="map">
            <span class="sidebar-nav-icon">🗺️</span> Map
          </div>
          <div class="sidebar-nav-item ${activeItem === 'feed' ? 'active' : ''}" data-nav="feed">
            <span class="sidebar-nav-icon">📋</span> Feed
          </div>
          <div class="sidebar-nav-item ${activeItem === 'portal' ? 'active' : ''}" data-nav="portal">
            <span class="sidebar-nav-icon">🏛️</span> Portal
          </div>
          <div class="sidebar-nav-item ${activeItem === 'settings' ? 'active' : ''}" data-nav="settings">
            <span class="sidebar-nav-icon">⚙️</span> Settings
          </div>
        </nav>

        <div class="sidebar-footer">
          <button class="btn-sidebar-report" data-nav="report">
            <span class="plus-icon">+</span> Submit Report
          </button>
          <div class="sidebar-extra">
            <div class="extra-item"><span>❓</span> Help</div>
            <div class="extra-item"><span>🛡️</span> Privacy</div>
          </div>
        </div>
      </aside>

      <!-- Content Area -->
      <main class="app-content-container">
        <header class="app-top-header">
           <div class="header-search">
             <span class="search-icon">🔍</span>
             <input type="text" placeholder="Search reports, tx_ids, or locations..." />
           </div>
           <div class="header-filters">
             <button class="btn-filter"><span>☰</span> Category</button>
             <button class="btn-filter"><span>🔘</span> Status</button>
           </div>
           <div class="header-user">
             <div class="notif-bell">🔔<span class="notif-dot"></span></div>
             <div class="user-profile">
               <div class="user-avatar">AJ</div>
               <span class="user-name">Arch. Julian</span>
             </div>
           </div>
        </header>
        <div class="app-page-content">
          ${content}
        </div>
        <footer class="app-status-bar">
          <div class="status-left">
            <span class="status-dot"></span> Network Status: Nominal
          </div>
          <div class="status-right">
            Latency: 14ms
          </div>
        </footer>
      </main>
    </div>
  `;
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
  return `
  <nav class="nav">
    <div class="nav-left">
      <a href="#" class="nav-logo" data-nav="landing">JanLedger</a>
      <div class="nav-links">
        <a href="#" ${active === 'Explore' ? 'class="active"' : ''} data-nav="ledger">Explore</a>
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
function renderOverview(): string {
  return `
  <div class="overview-grid">
    <!-- Center: Map -->
    <div class="overview-map-section">
      <div class="map-status-overlay">
         <div class="status-chip critical">● Critical</div>
         <div class="status-chip verified">● Verified</div>
         <div class="status-chip resolved">● Resolved</div>
      </div>
      <div id="overview-map" class="app-map"></div>
      <div class="map-zoom-controls">
        <button class="zoom-btn" id="map-zoom-in">+</button>
        <button class="zoom-btn" id="map-zoom-out">−</button>
        <button class="zoom-btn" id="map-locate">⊙</button>
      </div>
    </div>

    <!-- Right: Ledger -->
    <div class="overview-ledger-section">
      <div class="ledger-header">
        <div class="ledger-title">Civic Ledger</div>
        <div class="ledger-subtitle">Real-time immutable public requests.</div>
      </div>
      <div class="ledger-mini-list">
        ${renderMiniCard('/images/pothole.png', 'Severed Gas Main & Road Hazard', '224 Market St, District 4', 'OPEN', 'VERIFIED', '1.2k', '2 mins ago')}
        ${renderMiniCard('/images/streetlight.png', 'Non-functional Street Lighting', 'Oak Ave & 5th', 'IN PROGRESS', '', '348', '14 mins ago')}
        ${renderMiniCard('/images/building.png', 'Park Entrance Restoration', 'Central Park South', 'RESOLVED', '', '2.1k', '1 hr ago')}
        ${renderMiniCard('/images/pothole.png', 'Illegal Dumping Site', 'Industrial Way, Lot 12', 'OPEN', '', '56', '3 hrs ago')}
      </div>
    </div>
  </div>`;
}

function renderMiniCard(img: string, title: string, loc: string, status: string, badge: string, upvotes: string, time: string): string {
  return `
    <div class="mini-ledger-card" data-nav="detail">
      <div class="mini-card-thumb">
        <img src="${img}" alt="" />
      </div>
      <div class="mini-card-content">
        <div class="mini-card-tags">
          <span class="tag-status ${status.toLowerCase().replace(' ', '-')}">${status}</span>
          ${badge ? `<span class="tag-badge">${badge}</span>` : ''}
        </div>
        <div class="mini-card-title">${title}</div>
        <div class="mini-card-location">📍 ${loc}</div>
        <div class="mini-card-footer">
          <span class="footer-upvotes">👍 ${upvotes}</span>
          <span class="footer-time">${time}</span>
        </div>
      </div>
    </div>
  `;
}

function renderMapPage(): string {
  return `<div id="full-map" class="full-screen-map"></div>`;
}

function renderPortal(): string {
  return `
    <div class="placeholder-page">
      <h1>Agency Portal</h1>
      <p>Secure administrative gateway for verified municipal nodes.</p>
    </div>
  `;
}

function renderSettings(): string {
  return `
    <div class="placeholder-page">
      <h1>Settings</h1>
      <p>Manage your identity, notification nodes, and blockchain keys.</p>
    </div>
  `;
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

function initMap(elementId: string = 'dashboard-map') {
  const mapEl = document.getElementById(elementId);
  if (!mapEl || typeof L === 'undefined') return;

  if (dashboardMap) {
    dashboardMap.remove();
    dashboardMap = null;
  }

  dashboardMap = L.map(elementId, {
    zoomControl: false,
    attributionControl: false,
  }).setView([KORAMANGALA_LAT, KORAMANGALA_LNG], 14);

  // Using CartoDB Dark Matter for the dark/amber look
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
  }).addTo(dashboardMap);

  // Mock Amber/Golden glow points
  const markers = [
    { lat: 12.9356, lng: 77.6214, color: '#F59E0B' },
    { lat: 12.9410, lng: 77.6180, color: '#F59E0B' },
    { lat: 12.9716, lng: 77.6412, color: '#3B82F6' },
  ];

  markers.forEach(m => {
    L.circleMarker([m.lat, m.lng], {
      radius: 8,
      fillColor: m.color,
      color: m.color,
      weight: 2,
      opacity: 0.8,
      fillOpacity: 0.4,
    }).addTo(dashboardMap);
  });

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

      <div class="ai-summary-grid">
        <div class="ai-summary-card">
          <label>CATEGORY</label>
          <div>Infrastructure</div>
        </div>
        <div class="ai-summary-card">
          <label>ISSUE TYPE</label>
          <div>Pothole</div>
        </div>
      </div>

      <div class="location-detected-card">
        <span class="location-icon">📍</span>
        <div>
          <label>LOCATION DETECTED</label>
          <div id="final-location-text">Detecting precise address...</div>
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
        Submit to Ledger →
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
  if (!pill) return;

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      pill.innerHTML = `<span class="location-dot" style="color:var(--amber)">📍</span> ${latitude.toFixed(4)}°N, ${longitude.toFixed(4)}°E`;
      
      // Attempt Reverse Geocoding via Nominatim
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        const address = data.display_name.split(',').slice(0, 3).join(',');
        pill.innerHTML = `<span class="location-dot" style="color:var(--amber)">📍</span> ${address}`;
        
        const finalLocText = document.getElementById('final-location-text');
        if (finalLocText) finalLocText.textContent = data.display_name;
      } catch (e) {}
    }, () => {
      pill.innerHTML = `<span class="location-dot">📍</span> Location access denied`;
    });
  }
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
    stopCamera();
    reportStep = 2;
    render();
    
    // Auto-detect address in step 2 if we have cached coordinates
    detectLocation();
  }
}

// ============================================
// Complaint Detail Page
// ============================================
function renderDetail(): string {
  const e = selectedEntry;
  // fallback data if no entry selected
  const title = e ? e.title : 'Broken Street Light';
  const category = e ? e.category : 'PUBLIC SAFETY';
  const location = e ? e.location : 'North Avenue, Sector 4';
  const txHash = e ? e.txHash : '0x855300..f59e0b';
  const date = e ? e.date : '4/15/2026';
  const upvotes = e ? e.upvotes : 142;
  const guardianId = e ? e.guardianId : 'CIV-9A2F-K041';
  const coords = e ? e.coords : '12.93°N, 77.62°E';
  const severity = e ? e.severity : '4/5';
  const status = e ? e.status : 'INVESTIGATING';
  const events = e ? e.events : [];

  // Determine image based on category
  const imgMap: Record<string, string> = {
    'INFRASTRUCTURE': '/images/pothole.png',
    'PUBLIC SAFETY': '/images/streetlight.png',
    'SANITATION': '/images/building.png',
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
        <div class="ledger-stat-number">247</div>
        <div class="ledger-stat-label">Total Entries</div>
      </div>
      <div class="ledger-stat-card">
        <div class="ledger-stat-number ledger-stat-amber">38</div>
        <div class="ledger-stat-label">Active Investigations</div>
      </div>
      <div class="ledger-stat-card">
        <div class="ledger-stat-number ledger-stat-green">184</div>
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

interface LedgerEvent {
  text: string;
  time: string;
  color: 'green' | 'blue' | 'amber' | 'red';
}

interface LedgerEntry {
  id: string;
  title: string;
  category: string;
  status: string;
  statusColor: string;
  severity: string;
  location: string;
  txHash: string;
  date: string;
  events: LedgerEvent[];
  guardianId: string;
  coords: string;
  upvotes: number;
}

function getLedgerEntries(): LedgerEntry[] {
  return [
    {
      id: 'entry-1',
      title: 'Severe pothole cluster reported on 80 Feet Road',
      category: 'INFRASTRUCTURE',
      status: 'RESOLVED',
      statusColor: 'green',
      severity: '4/5',
      location: 'Koramangala 4th Block',
      txHash: '0xa3f7e2c1d9b4',
      date: '4/15/2026',
      events: [
        { text: 'Pothole depth measured at 18cm — verified by 3 citizen nodes', time: '4/15/2026, 10:30:00 AM', color: 'green' },
        { text: 'BBMP Ward 151 notified with evidence package', time: '4/15/2026, 10:35:00 AM', color: 'blue' },
        { text: '75 Civic Credits awarded to reporter', time: '4/15/2026, 10:37:00 AM', color: 'amber' },
        { text: 'Road resurfacing completed by BBMP contractor', time: '4/15/2026, 4:20:00 PM', color: 'green' },
      ],
      guardianId: 'CIV-9A2F-K041',
      coords: '12.93°N, 77.62°E',
      upvotes: 124,
    },
    {
      id: 'entry-2',
      title: 'Broken street light creating safety hazard near metro station',
      category: 'PUBLIC SAFETY',
      status: 'INVESTIGATING',
      statusColor: 'amber',
      severity: '3/5',
      location: 'Indiranagar, 100 Feet Road',
      txHash: '0xb8d4f5a9e170',
      date: '4/14/2026',
      events: [
        { text: 'Dark zone confirmed — 200m stretch without illumination', time: '4/14/2026, 8:50:00 PM', color: 'green' },
        { text: 'BESCOM maintenance division alerted', time: '4/14/2026, 8:55:00 PM', color: 'blue' },
        { text: '25 Civic Credits awarded', time: '4/14/2026, 8:52:00 PM', color: 'amber' },
      ],
      guardianId: 'CIV-4E8D-B135',
      coords: '12.97°N, 77.64°E',
      upvotes: 89,
    },
    {
      id: 'entry-3',
      title: 'Illegal garbage dump growing near Agara Lake boundary',
      category: 'SANITATION',
      status: 'AUTHORITY NOTIFIED',
      statusColor: 'blue',
      severity: '5/5',
      location: 'HSR Layout, Sector 2',
      txHash: '0xc2e6a8d3f412',
      date: '4/13/2026',
      events: [
        { text: 'Waste spread measured at ~400 sqm — photo evidence hashed', time: '4/13/2026, 7:15:00 AM', color: 'green' },
        { text: 'BBMP Solid Waste Management dept notified', time: '4/13/2026, 7:20:00 AM', color: 'blue' },
        { text: 'KSPCB environmental alert flagged', time: '4/13/2026, 7:25:00 AM', color: 'red' },
        { text: '100 Civic Credits awarded to reporter', time: '4/13/2026, 7:22:00 AM', color: 'amber' },
        { text: 'Cleanup drive scheduled for 4/16/2026', time: '4/14/2026, 2:00:00 PM', color: 'blue' },
      ],
      guardianId: 'CIV-7C1A-H592',
      coords: '12.91°N, 77.64°E',
      upvotes: 231,
    },
    {
      id: 'entry-4',
      title: 'Water pipeline leak causing road erosion on CMH Road',
      category: 'INFRASTRUCTURE',
      status: 'INVESTIGATING',
      statusColor: 'amber',
      severity: '4/5',
      location: 'Indiranagar, Near Metro',
      txHash: '0xd9f1b3c5e728',
      date: '4/12/2026',
      events: [
        { text: 'Continuous water flow detected — eroding asphalt layer', time: '4/12/2026, 11:40:00 AM', color: 'green' },
        { text: 'BWSSB emergency division contacted', time: '4/12/2026, 11:45:00 AM', color: 'blue' },
        { text: '50 Civic Credits awarded', time: '4/12/2026, 11:42:00 AM', color: 'amber' },
      ],
      guardianId: 'CIV-3F5B-M287',
      coords: '12.97°N, 77.64°E',
      upvotes: 67,
    },
    {
      id: 'entry-5',
      title: 'Overflowing storm drain flooding park entrance',
      category: 'INFRASTRUCTURE',
      status: 'RESOLVED',
      statusColor: 'green',
      severity: '3/5',
      location: 'Cubbon Park, MG Road',
      txHash: '0xe4a2d6f8b391',
      date: '4/11/2026',
      events: [
        { text: 'Drain blockage confirmed — overflow into park pathway', time: '4/11/2026, 6:30:00 AM', color: 'green' },
        { text: 'BBMP Storm Water Drain dept dispatched', time: '4/11/2026, 6:40:00 AM', color: 'blue' },
        { text: '40 Civic Credits awarded', time: '4/11/2026, 6:35:00 AM', color: 'amber' },
        { text: 'Drain cleared and pathway restored', time: '4/11/2026, 3:15:00 PM', color: 'green' },
      ],
      guardianId: 'CIV-2D8E-C463',
      coords: '12.97°N, 77.59°E',
      upvotes: 156,
    },
    {
      id: 'entry-6',
      title: 'Missing manhole cover on service road near Forum Mall',
      category: 'PUBLIC SAFETY',
      status: 'RESOLVED',
      statusColor: 'green',
      severity: '5/5',
      location: 'Koramangala, Forum Mall Road',
      txHash: '0xf7c3e9a1d584',
      date: '4/10/2026',
      events: [
        { text: 'Open manhole verified — extreme pedestrian risk', time: '4/10/2026, 9:00:00 AM', color: 'red' },
        { text: 'Emergency barricade placed by traffic police', time: '4/10/2026, 9:15:00 AM', color: 'blue' },
        { text: 'BBMP infrastructure team deployed', time: '4/10/2026, 9:30:00 AM', color: 'blue' },
        { text: '150 Civic Credits awarded for critical report', time: '4/10/2026, 9:05:00 AM', color: 'amber' },
        { text: 'New reinforced cover installed and inspected', time: '4/10/2026, 5:00:00 PM', color: 'green' },
      ],
      guardianId: 'CIV-8A4F-K718',
      coords: '12.93°N, 77.62°E',
      upvotes: 312,
    },
  ];
}

function renderLedgerEntry(entry: LedgerEntry): string {
  const statusClasses: Record<string, string> = {
    'green': 'resolved',
    'amber': 'processing',
    'blue': 'in-progress',
    'red': 'critical',
  };
  const statusClass = statusClasses[entry.statusColor] || '';

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

  // Submit report
  const submitBtn = document.getElementById('submit-report-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      submitBtn.textContent = '⏳ Hashing to Ledger...';
      submitBtn.style.opacity = '0.7';
      setTimeout(() => {
        submitBtn.textContent = '✓ Submitted to Civic Ledger';
        submitBtn.style.background = 'var(--info-green)';
        submitBtn.style.opacity = '1';
      }, 2000);
    });
  }

  // Support button
  const supportBtn = document.getElementById('support-btn');
  if (supportBtn) {
    supportBtn.addEventListener('click', () => {
      supportBtn.textContent = '✓ Supported!';
      supportBtn.style.background = 'var(--info-green)';
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
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      el.classList.toggle('upvoted');
      if (el.classList.contains('upvoted')) {
        el.style.color = 'var(--amber)';
      } else {
        el.style.color = '';
      }
    });
  });

  // App Sidebar Navigation
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const target = item as HTMLElement;
      if (target.dataset.nav) navigate(target.dataset.nav as Route);
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
      render();
    });
  }

  // Report Step 2 Submit
  const submitReportBtn = document.getElementById('submit-report-btn');
  if (submitReportBtn) {
    submitReportBtn.addEventListener('click', () => {
      submitReportBtn.innerHTML = 'Anchoring to Ledger...';
      submitReportBtn.style.opacity = '0.7';
      setTimeout(() => {
        reportStep = 1;
        navigate('ledger');
      }, 1500);
    });
  }
}

// ============================================
// Initialize
// ============================================
render();
