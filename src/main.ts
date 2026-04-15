import './style.css';

declare const L: any;

type Route = 'explore' | 'report' | 'track' | 'authority';
type Role = 'public' | 'citizen' | 'authority';
type Status = 'CRITICAL' | 'IN PROGRESS' | 'RESOLVED' | 'SCHEDULED';
type Department = 'BBMP' | 'BWSSB' | 'BESCOM';

interface Complaint {
  id: string;
  title: string;
  description: string;
  category: string;
  image: string;
  lat: number;
  lng: number;
  locationLabel: string;
  upvotes: number;
  status: Status;
  progressStage: number;
  routedTo: Department;
  reporterId: string;
  createdAt: string;
}

interface Suggestion {
  title: string;
  category: string;
  routedTo: Department;
  duplicateId: string | null;
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root not found.');
}

const progressStages = ['Submitted', 'Verified', 'Assigned', 'In Progress', 'Resolved'];
const statusToStage: Record<Status, number> = {
  CRITICAL: 1,
  SCHEDULED: 2,
  'IN PROGRESS': 3,
  RESOLVED: 4,
};

const citizenProfiles = [
  { id: 'citizen-asha', name: 'Asha' },
  { id: 'citizen-rohan', name: 'Rohan' },
];

let complaints: Complaint[] = [
  {
    id: 'C-1001',
    title: 'Deep pothole causing traffic slowdown',
    description: 'Large pothole near signal is damaging vehicles during peak hours.',
    category: 'Roads',
    image: '/images/pothole.png',
    lat: 12.9743,
    lng: 77.601,
    locationLabel: 'MG Road, Bengaluru',
    upvotes: 48,
    status: 'IN PROGRESS',
    progressStage: 3,
    routedTo: 'BBMP',
    reporterId: 'citizen-asha',
    createdAt: '2026-04-10',
  },
  {
    id: 'C-1002',
    title: 'Water line leak flooding footpath',
    description: 'Continuous leak from main line has flooded the sidewalk area.',
    category: 'Water',
    image: '/images/building.png',
    lat: 12.9784,
    lng: 77.6408,
    locationLabel: '100 Feet Road, Indiranagar',
    upvotes: 29,
    status: 'CRITICAL',
    progressStage: 1,
    routedTo: 'BWSSB',
    reporterId: 'citizen-rohan',
    createdAt: '2026-04-12',
  },
  {
    id: 'C-1003',
    title: 'Streetlight outage in pedestrian zone',
    description: 'Multiple poles are dark after 8 PM making the stretch unsafe.',
    category: 'Electricity',
    image: '/images/streetlight.png',
    lat: 12.9942,
    lng: 77.5703,
    locationLabel: 'Sampige Road, Malleshwaram',
    upvotes: 36,
    status: 'RESOLVED',
    progressStage: 4,
    routedTo: 'BESCOM',
    reporterId: 'citizen-asha',
    createdAt: '2026-04-06',
  },
  {
    id: 'C-1004',
    title: 'Garbage accumulation near bus stop',
    description: 'Waste has not been cleared for two days and is spreading to road edge.',
    category: 'Sanitation',
    image: '/images/building.png',
    lat: 12.9368,
    lng: 77.6191,
    locationLabel: 'Koramangala 5th Block',
    upvotes: 22,
    status: 'SCHEDULED',
    progressStage: 2,
    routedTo: 'BBMP',
    reporterId: 'citizen-rohan',
    createdAt: '2026-04-11',
  },
];

const auth = {
  role: 'public' as Role,
  userId: null as string | null,
  name: 'Public',
};

const reportDraft = {
  imageData: '',
  text: '',
  lat: null as number | null,
  lng: null as number | null,
  locationLabel: 'Location not captured yet',
  suggestion: null as Suggestion | null,
};

let route: Route = 'explore';
let selectedComplaintId = complaints[0]?.id ?? '';
let loginMenuOpen = false;
let flashMessage: string | null = null;
let flashTone: 'ok' | 'warn' = 'ok';
let flashTimeoutId: number | null = null;
let map: any = null;
const supportedThisSession = new Set<string>();

function navigate(nextRoute: Route): void {
  loginMenuOpen = false;
  route = nextRoute;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setFlash(message: string, tone: 'ok' | 'warn' = 'ok'): void {
  flashMessage = message;
  flashTone = tone;
  if (flashTimeoutId) {
    window.clearTimeout(flashTimeoutId);
  }
  flashTimeoutId = window.setTimeout(() => {
    flashMessage = null;
    render();
  }, 2400);
  render();
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getStatusClass(status: Status): string {
  switch (status) {
    case 'CRITICAL':
      return 'status-critical';
    case 'IN PROGRESS':
      return 'status-progress';
    case 'RESOLVED':
      return 'status-resolved';
    case 'SCHEDULED':
      return 'status-scheduled';
    default:
      return '';
  }
}

function getStatusMapColor(status: Status): string {
  switch (status) {
    case 'CRITICAL':
      return '#dc2626';
    case 'IN PROGRESS':
      return '#d97706';
    case 'RESOLVED':
      return '#15803d';
    case 'SCHEDULED':
      return '#0284c7';
    default:
      return '#334155';
  }
}

function getSelectedComplaint(): Complaint | null {
  return complaints.find((entry) => entry.id === selectedComplaintId) ?? null;
}

function getVisibleComplaintsForTrack(): Complaint[] {
  if (auth.role === 'citizen' && auth.userId) {
    return complaints.filter((entry) => entry.reporterId === auth.userId);
  }
  return complaints;
}

function render(): void {
  app.innerHTML = `
    <div class="app-shell">
      ${renderNav()}
      ${flashMessage ? `<div class="flash ${flashTone}">${escapeHtml(flashMessage)}</div>` : ''}
      <main class="page-container">
        ${renderRoute()}
      </main>
    </div>
  `;

  if (route === 'explore') {
    initExploreMap();
  } else {
    destroyMap();
  }
}

function renderNav(): string {
  return `
    <header class="navbar">
      <div class="brand-wrap">
        <span class="brand-dot"></span>
        <button class="brand" data-route="explore">JanLedger</button>
      </div>
      <nav class="main-nav" aria-label="Main navigation">
        <button class="nav-link ${route === 'explore' ? 'active' : ''}" data-route="explore">Explore</button>
        <button class="nav-link ${route === 'report' ? 'active' : ''}" data-route="report">Report</button>
        <button class="nav-link ${route === 'track' ? 'active' : ''}" data-route="track">Track</button>
      </nav>
      <div class="auth-wrap">
        <button id="loginToggle" class="login-button ${auth.role !== 'public' ? 'active' : ''}">
          ${auth.role === 'public' ? 'Login' : escapeHtml(auth.name)}
        </button>
        ${loginMenuOpen ? renderLoginMenu() : ''}
      </div>
    </header>
  `;
}

function renderLoginMenu(): string {
  if (auth.role === 'public') {
    return `
      <div class="login-menu">
        <h4>Choose role</h4>
        <button data-login="citizen">Citizen Login</button>
        <button data-login="authority">Authority Login</button>
      </div>
    `;
  }

  return `
    <div class="login-menu">
      <h4>Signed in as ${escapeHtml(auth.name)}</h4>
      ${auth.role === 'authority' ? '<button data-route="authority">Open Authority Panel</button>' : ''}
      <button data-login="logout">Logout</button>
    </div>
  `;
}

function renderRoute(): string {
  if (route === 'explore') {
    return renderExplorePage();
  }

  if (route === 'report') {
    return renderReportPage();
  }

  if (route === 'track') {
    return renderTrackPage();
  }

  return renderAuthorityPage();
}

function renderExplorePage(): string {
  const cards = complaints
    .slice()
    .sort((a, b) => b.upvotes - a.upvotes)
    .map(
      (entry) => `
        <article class="complaint-card" data-open-id="${entry.id}">
          <img src="${entry.image}" alt="${escapeHtml(entry.title)}" class="card-image" />
          <div class="card-content">
            <h3>${escapeHtml(entry.title)}</h3>
            <p class="card-location">${escapeHtml(entry.locationLabel)}</p>
            <div class="card-meta-row">
              <span class="support-count">${entry.upvotes} supports</span>
              <span class="status-chip ${getStatusClass(entry.status)}">${entry.status}</span>
            </div>
            <button class="support-button" data-support-id="${entry.id}">Support</button>
          </div>
        </article>
      `,
    )
    .join('');

  return `
    <section class="page-header">
      <p class="kicker">Public ledger</p>
      <h1>Live civic complaints with transparent support counts</h1>
      <p>Click any issue to open full progress tracking.</p>
    </section>

    <section class="explore-layout">
      <div class="map-panel">
        <div class="map-head">
          <h2>Complaint Map</h2>
          <span class="live-pill">Live</span>
        </div>
        <div id="exploreMap" class="explore-map" aria-label="Complaint map"></div>
      </div>
      <div class="ledger-panel">
        <h2>Complaint Ledger</h2>
        <p class="panel-copy">Duplicates become supports instead of duplicate records.</p>
        <div class="ledger-list">${cards}</div>
      </div>
    </section>
  `;
}

function renderReportPage(): string {
  if (auth.role !== 'citizen') {
    return `
      <section class="locked-panel">
        <h1>Citizen login required</h1>
        <p>Reporting and tracking your own complaints is available after citizen login.</p>
        <button class="primary" data-login="citizen">Login as Citizen</button>
      </section>
    `;
  }

  const suggestionCard = reportDraft.suggestion
    ? `
      <div class="suggestion-card">
        <h3>AI Suggestion</h3>
        <p><strong>Issue type:</strong> ${escapeHtml(reportDraft.suggestion.title)}</p>
        <p><strong>Category:</strong> ${escapeHtml(reportDraft.suggestion.category)}</p>
        <p><strong>Routed to:</strong> ${escapeHtml(reportDraft.suggestion.routedTo)}</p>
        ${
          reportDraft.suggestion.duplicateId
            ? `
              <div class="duplicate-warning">This issue already exists nearby</div>
              <button class="primary" data-action="support-duplicate" data-id="${reportDraft.suggestion.duplicateId}">
                Support Existing Issue
              </button>
            `
            : `
              <div class="new-issue-note">No similar issue found nearby.</div>
              <button class="primary" data-action="create-complaint">Create New Complaint</button>
            `
        }
      </div>
    `
    : '<div class="suggestion-card empty">Run analysis to get title, category, and duplicate check.</div>';

  return `
    <section class="page-header">
      <p class="kicker">Citizen reporting</p>
      <h1>Report an issue with image, text, and location</h1>
      <p>Duplicate complaints are merged into supports automatically.</p>
    </section>

    <section class="report-layout">
      <div class="report-form">
        <label class="upload-box" for="reportImage">
          ${
            reportDraft.imageData
              ? `<img src="${reportDraft.imageData}" alt="Uploaded issue" class="preview-image" />`
              : `
                <div class="upload-copy">
                  <span>Camera Upload</span>
                  <small>Tap to capture or upload issue image</small>
                </div>
              `
          }
        </label>
        <input id="reportImage" type="file" accept="image/*" capture="environment" />

        <label for="reportText">Optional Description</label>
        <textarea id="reportText" rows="5" placeholder="Add any detail that helps identify the issue">${escapeHtml(reportDraft.text)}</textarea>

        <div class="location-row">
          <button class="secondary" data-action="detect-location">Auto Detect Location</button>
          <p>${escapeHtml(reportDraft.locationLabel)}</p>
        </div>

        <button class="primary" data-action="analyze-report">Run AI Detection</button>
      </div>

      <aside class="report-ai-panel">
        ${suggestionCard}
      </aside>
    </section>
  `;
}

function renderTrackPage(): string {
  const visible = getVisibleComplaintsForTrack();

  if (auth.role === 'citizen' && visible.length === 0) {
    return `
      <section class="locked-panel">
        <h1>No complaints yet</h1>
        <p>Your submitted complaints will appear here for progress tracking.</p>
        <button class="primary" data-route="report">Go to Report</button>
      </section>
    `;
  }

  let complaint = getSelectedComplaint();

  if (!complaint || (auth.role === 'citizen' && complaint.reporterId !== auth.userId)) {
    complaint = visible[0] ?? null;
    if (complaint) {
      selectedComplaintId = complaint.id;
    }
  }

  if (!complaint) {
    return `
      <section class="locked-panel">
        <h1>Select a complaint from Explore</h1>
        <p>Open a complaint card to view progress and support details.</p>
        <button class="primary" data-route="explore">Back to Explore</button>
      </section>
    `;
  }

  const myComplaintList =
    auth.role === 'citizen'
      ? `
        <aside class="my-list">
          <h3>My Complaints</h3>
          ${visible
            .map(
              (entry) => `
                <button class="my-item ${entry.id === complaint.id ? 'active' : ''}" data-open-id="${entry.id}">
                  <span>${escapeHtml(entry.title)}</span>
                  <small>${escapeHtml(entry.locationLabel)}</small>
                </button>
              `,
            )
            .join('')}
        </aside>
      `
      : '';

  const tracker = progressStages
    .map(
      (stage, index) => `
        <li class="tracker-step ${index < complaint.progressStage ? 'done' : ''} ${index === complaint.progressStage ? 'current' : ''}">
          <span class="step-dot">${index + 1}</span>
          <span class="step-text">${stage}</span>
        </li>
      `,
    )
    .join('');

  return `
    <section class="page-header">
      <p class="kicker">Complaint detail</p>
      <h1>Track progress from submission to resolution</h1>
      <p>Amazon-style stage tracker with public accountability.</p>
    </section>

    <section class="track-layout ${auth.role === 'citizen' ? 'with-list' : ''}">
      ${myComplaintList}
      <article class="detail-card">
        <img src="${complaint.image}" alt="${escapeHtml(complaint.title)}" class="detail-image" />
        <div class="detail-main">
          <h2>${escapeHtml(complaint.title)}</h2>
          <p class="detail-location">${escapeHtml(complaint.locationLabel)}</p>
          <div class="detail-meta">
            <span>${complaint.upvotes} supports</span>
            <span class="status-chip ${getStatusClass(complaint.status)}">${complaint.status}</span>
          </div>

          <ol class="tracker">${tracker}</ol>

          <div class="detail-actions">
            <button class="primary" data-support-id="${complaint.id}">Support</button>
            <button class="secondary" data-action="share-issue" data-id="${complaint.id}">Share</button>
          </div>

          <p class="route-meta">Assigned to: ${complaint.routedTo}</p>
        </div>
      </article>
    </section>
  `;
}

function renderAuthorityPage(): string {
  if (auth.role !== 'authority') {
    return `
      <section class="locked-panel">
        <h1>Authority login required</h1>
        <p>Status updates are restricted to authority accounts.</p>
        <button class="primary" data-login="authority">Login as Authority</button>
      </section>
    `;
  }

  const rows = complaints
    .slice()
    .sort((a, b) => b.upvotes - a.upvotes)
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.title)}</td>
          <td>${escapeHtml(entry.locationLabel)}</td>
          <td>${entry.upvotes}</td>
          <td><span class="status-chip ${getStatusClass(entry.status)}">${entry.status}</span></td>
          <td>
            <div class="status-action">
              <select id="status-${entry.id}">
                ${(['CRITICAL', 'IN PROGRESS', 'RESOLVED', 'SCHEDULED'] as Status[])
                  .map((status) => `<option value="${status}" ${entry.status === status ? 'selected' : ''}>${status}</option>`)
                  .join('')}
              </select>
              <button class="secondary" data-action="update-status" data-id="${entry.id}">Update Status</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join('');

  return `
    <section class="page-header">
      <p class="kicker">Authority panel</p>
      <h1>Manage complaint status updates</h1>
      <p>Simple workflow for CRITICAL, IN PROGRESS, RESOLVED, and SCHEDULED.</p>
    </section>

    <section class="authority-table-wrap">
      <table class="authority-table">
        <thead>
          <tr>
            <th>Issue</th>
            <th>Location</th>
            <th>Upvotes</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function initExploreMap(): void {
  const mapElement = document.getElementById('exploreMap');

  if (!mapElement || typeof L === 'undefined') {
    return;
  }

  destroyMap();

  map = L.map(mapElement, { zoomControl: true }).setView([12.9716, 77.5946], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  complaints.forEach((entry) => {
    const marker = L.circleMarker([entry.lat, entry.lng], {
      radius: 8,
      color: '#ffffff',
      weight: 2,
      fillColor: getStatusMapColor(entry.status),
      fillOpacity: 0.95,
    }).addTo(map);

    marker.bindPopup(`
      <strong>${escapeHtml(entry.title)}</strong><br>
      ${escapeHtml(entry.locationLabel)}<br>
      Supports: ${entry.upvotes}
    `);

    marker.on('click', () => {
      selectedComplaintId = entry.id;
    });

    marker.on('dblclick', () => {
      selectedComplaintId = entry.id;
      navigate('track');
    });
  });
}

function destroyMap(): void {
  if (map) {
    map.remove();
    map = null;
  }
}

function handleSupport(complaintId: string): void {
  const complaint = complaints.find((entry) => entry.id === complaintId);
  if (!complaint) {
    return;
  }

  if (supportedThisSession.has(complaintId)) {
    setFlash('You already supported this issue in this session.', 'warn');
    return;
  }

  complaint.upvotes += 1;
  supportedThisSession.add(complaintId);
  setFlash('Support added to complaint.');
}

function resetReportDraft(): void {
  reportDraft.imageData = '';
  reportDraft.text = '';
  reportDraft.lat = null;
  reportDraft.lng = null;
  reportDraft.locationLabel = 'Location not captured yet';
  reportDraft.suggestion = null;
}

function detectLocation(): void {
  const fallbackLocations = [
    { lat: 12.9719, lng: 77.5937, label: 'Cubbon Park vicinity, Bengaluru' },
    { lat: 12.9306, lng: 77.6784, label: 'Marathahalli bridge area, Bengaluru' },
    { lat: 12.9915, lng: 77.5714, label: 'Rajajinagar main road, Bengaluru' },
  ];

  const fallback = () => {
    const pick = fallbackLocations[Math.floor(Math.random() * fallbackLocations.length)];
    reportDraft.lat = pick.lat;
    reportDraft.lng = pick.lng;
    reportDraft.locationLabel = pick.label;
    setFlash('Location captured from nearby civic zone.');
  };

  if (!navigator.geolocation) {
    fallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      reportDraft.lat = position.coords.latitude;
      reportDraft.lng = position.coords.longitude;
      reportDraft.locationLabel = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} (auto detected)`;
      setFlash('Location captured successfully.');
    },
    () => {
      fallback();
    },
    { enableHighAccuracy: true, timeout: 4000 },
  );
}

function detectSuggestion(text: string, lat: number, lng: number): Suggestion {
  const normalized = text.toLowerCase();

  let category = 'Roads';
  let title = 'Road surface damage reported by citizen';
  let routedTo: Department = 'BBMP';

  if (normalized.includes('water') || normalized.includes('leak') || normalized.includes('sewage') || normalized.includes('pipe')) {
    category = 'Water';
    title = 'Water pipeline leak affecting public pathway';
    routedTo = 'BWSSB';
  } else if (
    normalized.includes('light') ||
    normalized.includes('electric') ||
    normalized.includes('power') ||
    normalized.includes('transformer')
  ) {
    category = 'Electricity';
    title = 'Public lighting or power fault reported';
    routedTo = 'BESCOM';
  } else if (normalized.includes('garbage') || normalized.includes('waste') || normalized.includes('trash')) {
    category = 'Sanitation';
    title = 'Garbage accumulation needs clearance';
    routedTo = 'BBMP';
  } else if (normalized.includes('pothole') || normalized.includes('road') || normalized.includes('drain')) {
    category = 'Roads';
    title = 'Road hazard affecting commuter safety';
    routedTo = 'BBMP';
  }

  const duplicate = findNearbyDuplicate(lat, lng, category);

  return {
    title,
    category,
    routedTo,
    duplicateId: duplicate?.id ?? null,
  };
}

function findNearbyDuplicate(lat: number, lng: number, category: string): Complaint | null {
  let bestMatch: Complaint | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const entry of complaints) {
    if (entry.category !== category || entry.status === 'RESOLVED') {
      continue;
    }

    const distanceKm = haversineDistanceKm(lat, lng, entry.lat, entry.lng);

    if (distanceKm < 0.9 && distanceKm < minDistance) {
      bestMatch = entry;
      minDistance = distanceKm;
    }
  }

  return bestMatch;
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

async function shareComplaint(complaintId: string): Promise<void> {
  const complaint = complaints.find((entry) => entry.id === complaintId);

  if (!complaint) {
    return;
  }

  const payload = `JanLedger Issue: ${complaint.title} | ${complaint.locationLabel} | Supports: ${complaint.upvotes}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: complaint.title,
        text: payload,
      });
      setFlash('Complaint shared.');
      return;
    } catch {
      // Ignore and fall back to clipboard.
    }
  }

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(payload);
    setFlash('Share text copied to clipboard.');
    return;
  }

  setFlash('Sharing is unavailable in this browser.', 'warn');
}

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;

  const routeButton = target.closest<HTMLElement>('[data-route]');
  if (routeButton) {
    const nextRoute = routeButton.dataset.route as Route | undefined;
    if (nextRoute) {
      navigate(nextRoute);
      return;
    }
  }

  const loginToggle = target.closest<HTMLElement>('#loginToggle');
  if (loginToggle) {
    loginMenuOpen = !loginMenuOpen;
    render();
    return;
  }

  const loginAction = target.closest<HTMLElement>('[data-login]');
  if (loginAction) {
    const loginType = loginAction.dataset.login;

    if (loginType === 'citizen') {
      const profile = citizenProfiles[0];
      auth.role = 'citizen';
      auth.userId = profile.id;
      auth.name = profile.name;
      loginMenuOpen = false;
      navigate('report');
      setFlash('Signed in as citizen.');
      return;
    }

    if (loginType === 'authority') {
      auth.role = 'authority';
      auth.userId = 'authority-user';
      auth.name = 'Authority';
      loginMenuOpen = false;
      navigate('authority');
      setFlash('Signed in as authority.');
      return;
    }

    auth.role = 'public';
    auth.userId = null;
    auth.name = 'Public';
    loginMenuOpen = false;
    navigate('explore');
    setFlash('Logged out successfully.');
    return;
  }

  const openComplaint = target.closest<HTMLElement>('[data-open-id]');
  if (openComplaint) {
    selectedComplaintId = openComplaint.dataset.openId ?? selectedComplaintId;
    navigate('track');
    return;
  }

  const supportButton = target.closest<HTMLElement>('[data-support-id]');
  if (supportButton) {
    const complaintId = supportButton.dataset.supportId;
    if (complaintId) {
      handleSupport(complaintId);
    }
    return;
  }

  const actionButton = target.closest<HTMLElement>('[data-action]');
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action;

  if (action === 'detect-location') {
    detectLocation();
    return;
  }

  if (action === 'analyze-report') {
    if (!reportDraft.imageData) {
      setFlash('Please upload an image before AI detection.', 'warn');
      return;
    }

    if (reportDraft.lat === null || reportDraft.lng === null) {
      setFlash('Please capture location before AI detection.', 'warn');
      return;
    }

    reportDraft.suggestion = detectSuggestion(reportDraft.text, reportDraft.lat, reportDraft.lng);
    render();
    return;
  }

  if (action === 'support-duplicate') {
    const duplicateId = actionButton.dataset.id;
    if (duplicateId) {
      handleSupport(duplicateId);
      selectedComplaintId = duplicateId;
      navigate('track');
    }
    return;
  }

  if (action === 'create-complaint') {
    if (!reportDraft.suggestion || reportDraft.lat === null || reportDraft.lng === null || !auth.userId) {
      setFlash('Run AI detection before creating complaint.', 'warn');
      return;
    }

    const newComplaint: Complaint = {
      id: `C-${(1000 + complaints.length + 1).toString()}`,
      title: reportDraft.suggestion.title,
      description: reportDraft.text || 'Citizen submitted complaint with image evidence.',
      category: reportDraft.suggestion.category,
      image: reportDraft.imageData,
      lat: reportDraft.lat,
      lng: reportDraft.lng,
      locationLabel: reportDraft.locationLabel,
      upvotes: 1,
      status: 'CRITICAL',
      progressStage: 0,
      routedTo: reportDraft.suggestion.routedTo,
      reporterId: auth.userId,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    complaints = [newComplaint, ...complaints];
    selectedComplaintId = newComplaint.id;
    resetReportDraft();
    navigate('track');
    setFlash('New complaint created in the public ledger.');
    return;
  }

  if (action === 'share-issue') {
    const issueId = actionButton.dataset.id;
    if (issueId) {
      void shareComplaint(issueId);
    }
    return;
  }

  if (action === 'update-status') {
    const issueId = actionButton.dataset.id;
    if (!issueId) {
      return;
    }

    const complaint = complaints.find((entry) => entry.id === issueId);
    const statusSelect = document.getElementById(`status-${issueId}`) as HTMLSelectElement | null;

    if (!complaint || !statusSelect) {
      return;
    }

    const newStatus = statusSelect.value as Status;
    complaint.status = newStatus;
    complaint.progressStage = statusToStage[newStatus];
    setFlash('Complaint status updated.');
  }
});

app.addEventListener('change', (event) => {
  const target = event.target as HTMLElement;

  if (target instanceof HTMLInputElement && target.id === 'reportImage' && target.files && target.files.length > 0) {
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      reportDraft.imageData = typeof reader.result === 'string' ? reader.result : '';
      reportDraft.suggestion = null;
      render();
    };
    reader.readAsDataURL(file);
  }

  if (target instanceof HTMLTextAreaElement && target.id === 'reportText') {
    reportDraft.text = target.value;
    reportDraft.suggestion = null;
  }
});

render();
