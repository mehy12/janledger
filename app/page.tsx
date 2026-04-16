'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

const CivicMap = dynamic(() => import('../components/map/CivicMap'), { ssr: false });

import { authClient } from './lib/auth-client';

type Route = 'explore' | 'report' | 'track' | 'authority';
type Role = 'public' | 'citizen' | 'authority';
type Status = 'CRITICAL' | 'IN PROGRESS' | 'RESOLVED' | 'SCHEDULED';
type Department = 'BBMP' | 'BWSSB' | 'BESCOM';
type ExploreMode = 'map' | 'ledger';
type LedgerFilter = 'all' | 'investigating' | 'notified' | 'resolved';

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
  hash?: string | null;
  txHash?: string | null;
  afterImage?: string;
}

interface AuthSessionUser {
  id: string;
  name: string;
  username?: string;
  role?: string;
}

interface Suggestion {
  title: string;
  category: string;
  description: string;
  routedTo: Department;
  source: 'ai' | 'fallback';
  duplicateId: string | null;
}

const statusToStage: Record<Status, number> = {
  CRITICAL: 1,
  SCHEDULED: 2,
  'IN PROGRESS': 3,
  RESOLVED: 4,
};

const progressStages = ['Submitted', 'Verified', 'Assigned', 'In Progress', 'Resolved'];
const complaintsStorageKey = 'janledger:complaints';
const GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
] as const;
const GEMINI_API_VERSIONS = ['v1', 'v1beta'] as const;
const DUPLICATE_RADIUS_KM = 0.03;
const GEMINI_API_KEY =
  (globalThis as { JANLEDGER_GEMINI_API_KEY?: string }).JANLEDGER_GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '';

type ReportCategory = 'Roads' | 'Water' | 'Electricity' | 'Sanitation' | 'Traffic';

function statusClass(status: Status): string {
  if (status === 'CRITICAL') return 'status-critical';
  if (status === 'IN PROGRESS') return 'status-progress';
  if (status === 'RESOLVED') return 'status-resolved';
  return 'status-scheduled';
}

function parseComplaints(value: unknown): Complaint[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw, index): Complaint | null => {
      if (!raw || typeof raw !== 'object') return null;
      const item = raw as Record<string, unknown>;

      const status =
        item.status === 'CRITICAL' ||
          item.status === 'IN PROGRESS' ||
          item.status === 'RESOLVED' ||
          item.status === 'SCHEDULED'
          ? item.status
          : 'CRITICAL';
      const routedTo = item.routedTo === 'BWSSB' || item.routedTo === 'BESCOM' ? item.routedTo : 'BBMP';

      return {
        id: typeof item.id === 'string' ? item.id : `C-${1000 + index + 1}`,
        title: typeof item.title === 'string' ? item.title : 'Untitled civic issue',
        description: typeof item.description === 'string' ? item.description : 'No description provided.',
        category: typeof item.category === 'string' ? item.category : 'General',
        image: typeof item.image === 'string' ? item.image : '/images/building.png',
        lat: typeof item.lat === 'number' ? item.lat : 12.9716,
        lng: typeof item.lng === 'number' ? item.lng : 77.5946,
        locationLabel: typeof item.locationLabel === 'string' ? item.locationLabel : 'Unknown location',
        upvotes: typeof item.upvotes === 'number' ? Math.max(0, Math.round(item.upvotes)) : 0,
        status,
        progressStage:
          typeof item.progressStage === 'number'
            ? Math.max(0, Math.min(4, Math.round(item.progressStage)))
            : statusToStage[status],
        routedTo,
        reporterId: typeof item.reporterId === 'string' ? item.reporterId : 'citizen-unknown',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString().slice(0, 10),
        hash: typeof item.hash === 'string' ? item.hash : null,
        txHash: typeof item.txHash === 'string' ? item.txHash : null,
        afterImage: typeof item.afterImage === 'string' ? item.afterImage : undefined,
      };
    })
    .filter((entry): entry is Complaint => entry !== null);
}

function slugifyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 8);
}

function generateUsername(nameHint: string): string {
  const base = slugifyName(nameHint) || 'citizen';
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}${suffix}`;
}

function calculateContributionScore(userComplaints: Complaint[]): number {
  return userComplaints.reduce((acc, complaint) => {
    let score = 1; // Base report
    if (complaint.status === 'RESOLVED') score += 3; // Solved
    if (complaint.upvotes >= 5) score += 2; // Impact
    return acc + score;
  }, 0);
}

function getContributionRank(score: number) {
  if (score >= 100) return { name: 'Diamond Contributor', icon: '💎', current: score, next: score, max: score, percentage: 100 };
  if (score >= 50) return { name: 'Gold Contributor', icon: '🥇', current: score, next: 100, max: 100, percentage: (score / 100) * 100 };
  if (score >= 25) return { name: 'Silver Contributor', icon: '🥈', current: score, next: 50, max: 50, percentage: (score / 50) * 100 };
  if (score >= 10) return { name: 'Bronze Contributor', icon: '🥉', current: score, next: 25, max: 25, percentage: (score / 25) * 100 };
  return { name: 'Starter', icon: '', current: score, next: 10, max: 10, percentage: (score / 10) * 100 };
}

function parseSessionUser(value: unknown): AuthSessionUser | null {
  if (!value || typeof value !== 'object') return null;

  const source = value as Record<string, unknown>;
  const candidate = source.user && typeof source.user === 'object' ? (source.user as Record<string, unknown>) : source;

  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    username: typeof candidate.username === 'string' ? candidate.username : undefined,
    role: typeof candidate.role === 'string' ? candidate.role : undefined,
  };
}

function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;

  const data = error as Record<string, unknown>;
  if (typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }
  if (typeof data.statusText === 'string' && data.statusText.trim()) {
    return data.statusText;
  }

  return fallback;
}

function normalizeReportCategory(value: string): ReportCategory {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('water') || normalized.includes('sewage') || normalized.includes('drain') || normalized.includes('pipe')) {
    return 'Water';
  }
  if (normalized.includes('electric') || normalized.includes('light') || normalized.includes('power') || normalized.includes('transformer')) {
    return 'Electricity';
  }
  if (normalized.includes('sanitation') || normalized.includes('garbage') || normalized.includes('waste') || normalized.includes('trash')) {
    return 'Sanitation';
  }
  if (normalized.includes('traffic') || normalized.includes('signal') || normalized.includes('congestion')) {
    return 'Traffic';
  }
  return 'Roads';
}

function routeDepartment(category: ReportCategory): Department {
  if (category === 'Water') return 'BWSSB';
  if (category === 'Electricity') return 'BESCOM';
  return 'BBMP';
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;

  try {
    return JSON.parse(objectMatch[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseGeminiErrorMessage(raw: string): string {
  if (!raw.trim()) return 'No error body returned by Gemini.';
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // If response is not JSON, return a shortened raw body.
  }

  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

function summarizeGeminiFailures(errors: string[]): string {
  const unique = [...new Set(errors)];
  const joined = unique.join(' | ').toLowerCase();

  if (joined.includes('429')) {
    return 'The image is not a greivance related issue.';
  }

  if (joined.includes('401') || joined.includes('403')) {
    return 'Gemini API key is invalid or lacks permission for this project.';
  }

  if (joined.includes('404')) {
    return 'Configured Gemini model endpoint is unavailable for this key/project.';
  }

  const short = unique.slice(0, 2).join(' | ');
  return `Gemini request failed. ${short}`;
}

function deriveHeuristicSuggestion(input: string): { title: string; category: ReportCategory; description: string; routedTo: Department } {
  const normalized = input.toLowerCase();
  let category: ReportCategory = 'Roads';
  let title = 'Road surface damage reported by citizen';
  let description = 'Citizen uploaded image evidence for a road-related civic issue.';

  if (normalized.includes('water') || normalized.includes('leak') || normalized.includes('sewage') || normalized.includes('pipe')) {
    category = 'Water';
    title = 'Water pipeline leak affecting public pathway';
    description = 'Image suggests a water supply or drainage issue requiring BWSSB attention.';
  } else if (
    normalized.includes('light') ||
    normalized.includes('electric') ||
    normalized.includes('power') ||
    normalized.includes('transformer')
  ) {
    category = 'Electricity';
    title = 'Public lighting or power fault reported';
    description = 'Image suggests an electrical infrastructure issue in a public zone.';
  } else if (normalized.includes('garbage') || normalized.includes('waste') || normalized.includes('trash') || normalized.includes('sanitation')) {
    category = 'Sanitation';
    title = 'Garbage accumulation needs clearance';
    description = 'Image suggests sanitation waste accumulation requiring civic cleanup.';
  } else if (normalized.includes('traffic') || normalized.includes('signal') || normalized.includes('jam')) {
    category = 'Traffic';
    title = 'Traffic management issue reported by citizen';
    description = 'Image suggests a traffic-flow or traffic-safety concern.';
  }

  return {
    title,
    category,
    description,
    routedTo: routeDepartment(category),
  };
}

async function extractSuggestionFromImage(
  imageDataUrl: string,
  contextText: string,
): Promise<{ title: string; category: ReportCategory; description: string; routedTo: Department }> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  const dataMatch = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!dataMatch) {
    throw new Error('Invalid image payload.');
  }

  const mimeType = dataMatch[1];
  const base64Data = dataMatch[2];
  const prompt = [
    'Analyze this civic-issue image and return ONLY valid JSON.',
    'Schema:',
    '{"title":"","description":"","category":"","severity":"","keywords":[]}',
    'Rules:',
    '- category must be one of: Roads, Water, Electricity, Sanitation, Traffic',
    '- title must be concise and specific to the visible issue',
    '- description should explain what is visibly wrong',
    '- do not rely on user text if the image disagrees',
    `- user context: ${contextText || 'None provided'}`,
  ].join('\n');

  const requestBody = JSON.stringify({
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
  });

  let rawText: string | undefined;
  const attemptErrors: string[] = [];

  for (const apiVersion of GEMINI_API_VERSIONS) {
    for (const model of GEMINI_MODEL_CANDIDATES) {
      const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) break;
        attemptErrors.push(`${apiVersion}/${model}: empty extraction response`);
        continue;
      }

      const errorBody = await response.text();
      const errorMessage = parseGeminiErrorMessage(errorBody);

      attemptErrors.push(`${apiVersion}/${model}: ${response.status} ${errorMessage}`);

      if (response.status === 401 || response.status === 403) {
        throw new Error('Gemini API key is invalid or lacks permission for this project.');
      }
    }

    if (rawText) break;
  }

  if (!rawText) {
    throw new Error(summarizeGeminiFailures(attemptErrors));
  }

  const parsed = extractJsonObject(rawText);
  if (!parsed) {
    throw new Error('Gemini response was not parseable JSON.');
  }

  const category = normalizeReportCategory(typeof parsed.category === 'string' ? parsed.category : 'Roads');
  const title =
    typeof parsed.title === 'string' && parsed.title.trim().length > 0
      ? parsed.title.trim().slice(0, 90)
      : deriveHeuristicSuggestion(contextText).title;
  const description =
    typeof parsed.description === 'string' && parsed.description.trim().length > 0
      ? parsed.description.trim().slice(0, 220)
      : deriveHeuristicSuggestion(contextText).description;

  return {
    title,
    category,
    description,
    routedTo: routeDepartment(category),
  };
}

export default function Page() {
  const [route, setRoute] = useState<Route>('explore');
  const [exploreMode, setExploreMode] = useState<ExploreMode>('ledger');
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState('');
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [supported, setSupported] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<{ message: string; tone: 'ok' | 'warn' } | null>(null);
  const [showLevelInfo, setShowLevelInfo] = useState(false);

  const [auth, setAuth] = useState<{ role: Role; userId: string | null; name: string; username?: string | null }>({
    role: 'public',
    userId: null,
    name: 'Public',
    username: null,
  });

  const [loginDraft, setLoginDraft] = useState({ email: '', password: '' });
  const [signupDraft, setSignupDraft] = useState({
    name: '',
    phone: '',
    email: '',
    username: generateUsername(''),
    password: '',
  });
  const [reportDraft, setReportDraft] = useState<{
    imageData: string;
    text: string;
    lat: number | null;
    lng: number | null;
    locationLabel: string;
    suggestion: Suggestion | null;
  }>({
    imageData: '',
    text: '',
    lat: null,
    lng: null,
    locationLabel: 'Location not captured yet',
    suggestion: null,
  });

  useEffect(() => {
    const storedComplaints = localStorage.getItem(complaintsStorageKey);
    if (storedComplaints) {
      setComplaints(parseComplaints(JSON.parse(storedComplaints)));
      return;
    }

    void fetch('/api/complaints', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .then((payload) => {
        const list = parseComplaints(payload);
        setComplaints(list);
      })
      .catch(() => setComplaints([]));
  }, []);

  // Poll for blockchain verification updates
  useEffect(() => {
    // Check if we have any pending complaints (has hash, but no txHash)
    const hasPending = complaints.some((c) => c.hash && !c.txHash);
    if (!hasPending) return;

    const interval = setInterval(() => {
      fetch('/api/complaints', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload) => {
          if (!payload) return;
          const updatedList = parseComplaints(payload);

          setComplaints((prev) => {
            let changed = false;
            const nextList = prev.map((localEntry) => {
              const remoteEntry = updatedList.find((r) => r.id === localEntry.id);
              if (remoteEntry && remoteEntry.txHash && !localEntry.txHash) {
                changed = true;
                return { ...localEntry, txHash: remoteEntry.txHash };
              }
              return localEntry;
            });
            return changed ? nextList : prev;
          });
        })
        .catch(() => { });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [complaints]);

  useEffect(() => {
    localStorage.setItem(complaintsStorageKey, JSON.stringify(complaints));
    if (!complaints.some((entry) => entry.id === selectedComplaintId)) {
      setSelectedComplaintId(complaints[0]?.id ?? '');
    }
  }, [complaints, selectedComplaintId]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        const response = await authClient.getSession();
        if (!isMounted) return;

        const user = parseSessionUser(response.data);
        if (!user) return;

        setAuth({
          role: user.role === 'authority' ? 'authority' : 'citizen',
          userId: user.id,
          name: user.name,
          username: user.username ?? null,
        });
      } catch {
        // Keep public mode when session bootstrap fails.
      }
    };

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredComplaints = useMemo(() => {
    const base = complaints.filter((entry) => {
      if (ledgerFilter === 'all') return true;
      if (ledgerFilter === 'resolved') return entry.status === 'RESOLVED';
      if (ledgerFilter === 'notified') return entry.status === 'SCHEDULED';
      return entry.status === 'CRITICAL' || entry.status === 'IN PROGRESS';
    });

    const query = ledgerSearch.trim().toLowerCase();
    if (!query) return base;

    return base.filter((entry) => {
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.locationLabel.toLowerCase().includes(query) ||
        entry.category.toLowerCase().includes(query)
      );
    });
  }, [complaints, ledgerFilter, ledgerSearch]);

  const selectedComplaint = useMemo(
    () => complaints.find((entry) => entry.id === selectedComplaintId) ?? complaints[0] ?? null,
    [complaints, selectedComplaintId],
  );

  const visibleTrackComplaints = useMemo(() => {
    if (auth.role === 'citizen' && auth.userId) {
      return complaints.filter((entry) => entry.reporterId === auth.userId);
    }
    return complaints;
  }, [auth.role, auth.userId, complaints]);

  const upvote = (id: string) => {
    if (supported.has(id)) {
      setFlash({ message: 'You already supported this issue in this session.', tone: 'warn' });
      return;
    }

    setComplaints((prev) => prev.map((entry) => (entry.id === id ? { ...entry, upvotes: entry.upvotes + 1 } : entry)));
    setSupported((prev) => new Set(prev).add(id));
    setFlash({ message: 'Support added to complaint.', tone: 'ok' });
  };

  const detectLocation = () => {
    const fallback = [
      { lat: 12.9719, lng: 77.5937, label: 'Cubbon Park vicinity, Bengaluru' },
      { lat: 12.9306, lng: 77.6784, label: 'Marathahalli bridge area, Bengaluru' },
      { lat: 12.9915, lng: 77.5714, label: 'Rajajinagar main road, Bengaluru' },
    ];

    const useFallback = () => {
      const pick = fallback[Math.floor(Math.random() * fallback.length)];
      setReportDraft((prev) => ({ ...prev, lat: pick.lat, lng: pick.lng, locationLabel: pick.label }));
      setFlash({ message: 'Location captured from nearby civic zone.', tone: 'ok' });
    };

    if (!navigator.geolocation) {
      useFallback();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReportDraft((prev) => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          locationLabel: `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)} (auto detected)`,
        }));
        setFlash({ message: 'Location captured successfully.', tone: 'ok' });
      },
      () => useFallback(),
      { enableHighAccuracy: true, timeout: 4000 },
    );
  };

  const findDuplicate = (lat: number, lng: number, category: string): Complaint | null => {
    let best: Complaint | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entry of complaints) {
      if (entry.category !== category || entry.status === 'RESOLVED') continue;

      const dLat = ((entry.lat - lat) * Math.PI) / 180;
      const dLng = ((entry.lng - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) * Math.cos((entry.lat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const distance = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (distance < DUPLICATE_RADIUS_KM && distance < bestDistance) {
        best = entry;
        bestDistance = distance;
      }
    }

    return best;
  };

  const analyzeReport = async () => {
    if (!reportDraft.imageData) {
      setFlash({ message: 'Please upload an image before AI detection.', tone: 'warn' });
      return;
    }
    if (reportDraft.lat === null || reportDraft.lng === null) {
      setFlash({ message: 'Please capture location before AI detection.', tone: 'warn' });
      return;
    }

    setAnalysisPending(true);
    setAnalysisError(null);

    const fallback = deriveHeuristicSuggestion(reportDraft.text);
    let suggestion: { title: string; category: ReportCategory; description: string; routedTo: Department; source: 'ai' | 'fallback' } = {
      ...fallback,
      source: 'fallback',
    };

    try {
      const extracted = await extractSuggestionFromImage(reportDraft.imageData, reportDraft.text);
      suggestion = {
        ...extracted,
        source: 'ai',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image analysis failed.';
      setAnalysisError(`${message} Using fallback detection.`);
    } finally {
      setAnalysisPending(false);
    }

    const duplicate = findDuplicate(reportDraft.lat, reportDraft.lng, suggestion.category);
    setReportDraft((prev) => ({
      ...prev,
      suggestion: {
        ...suggestion,
        duplicateId: duplicate?.id ?? null,
      },
    }));
  };

  const createComplaint = async () => {
    if (!reportDraft.suggestion || reportDraft.lat === null || reportDraft.lng === null || !auth.userId) {
      setFlash({ message: 'Run AI detection before creating complaint.', tone: 'warn' });
      return;
    }

    const newComplaint: Complaint = {
      id: `C-${1000 + complaints.length + 1}`,
      title: reportDraft.suggestion.title,
      description: reportDraft.text.trim() || reportDraft.suggestion.description || 'Citizen submitted complaint with image evidence.',
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
      hash: null,
      txHash: null,
    };

    // Optimistic UI update
    setComplaints((prev) => [newComplaint, ...prev]);
    setSelectedComplaintId(newComplaint.id);
    setReportDraft({
      imageData: '',
      text: '',
      lat: null,
      lng: null,
      locationLabel: 'Location not captured yet',
      suggestion: null,
    });
    setAnalysisError(null);
    setRoute('track');
    setFlash({ message: '✨ +1 Civic Contribution!', tone: 'ok' });

    // POST to server for DB + blockchain (non-blocking)
    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newComplaint),
      });
      if (response.ok) {
        const saved = await response.json();
        setComplaints((prev) =>
          prev.map((entry) =>
            entry.id === saved.id ? { ...entry, hash: saved.hash, txHash: saved.txHash } : entry,
          ),
        );
      }
    } catch (error) {
      console.error('Failed to persist complaint to server:', error);
      // Complaint is still saved locally — blockchain will be attempted on next opportunity
    }
  };

  const handleReportImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setReportDraft((prev) => ({
        ...prev,
        imageData: typeof reader.result === 'string' ? reader.result : '',
        suggestion: null,
      }));
      setAnalysisError(null);
    };
    reader.readAsDataURL(file);
  };

  const applySessionUser = (user: AuthSessionUser) => {
    setAuth({
      role: user.role === 'authority' ? 'authority' : 'citizen',
      userId: user.id,
      name: user.name,
      username: user.username ?? null,
    });
  };

  const syncCitizenSession = async (): Promise<AuthSessionUser | null> => {
    try {
      const response = await authClient.getSession();
      const user = parseSessionUser(response.data);
      if (user) {
        applySessionUser(user);
        return user;
      }
    } catch {
      // We intentionally keep UI responsive even if session sync fails.
    }

    setAuth((prev) =>
      prev.role === 'authority'
        ? prev
        : {
          role: 'public',
          userId: null,
          name: 'Public',
          username: null,
        },
    );
    return null;
  };

  const createCitizenAccount = async () => {
    const name = signupDraft.name.trim();
    const phone = signupDraft.phone.trim();
    const email = signupDraft.email.trim().toLowerCase();
    const password = signupDraft.password;
    const username = signupDraft.username.trim().toLowerCase();

    if (!name) {
      setFlash({ message: 'Please enter your name.', tone: 'warn' });
      return;
    }
    if (!phone || !/^[0-9+\-\s]{8,16}$/.test(phone)) {
      setFlash({ message: 'Please enter a valid phone number.', tone: 'warn' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFlash({ message: 'Please enter a valid email address.', tone: 'warn' });
      return;
    }
    if (password.length < 8) {
      setFlash({ message: 'Password must be at least 8 characters.', tone: 'warn' });
      return;
    }
    if (username.length < 4) {
      setFlash({ message: 'Please generate a longer username.', tone: 'warn' });
      return;
    }

    setAuthPending(true);
    try {
      const result = await authClient.signUp.email({
        name,
        phone,
        email,
        password,
        username,
        role: 'citizen',
      });

      if (result.error) {
        setFlash({ message: getAuthErrorMessage(result.error, 'Unable to create account right now.'), tone: 'warn' });
        return;
      }

      const sessionUser = parseSessionUser(result.data) ?? (await syncCitizenSession());
      if (!sessionUser) {
        setFlash({ message: 'Account created, but sign-in session was not confirmed.', tone: 'warn' });
        return;
      }

      applySessionUser(sessionUser);
      setSignupOpen(false);
      setLoginMenuOpen(false);
      setRoute('report');
      setSignupDraft({ name: '', phone: '', email: '', username: generateUsername(''), password: '' });
      setFlash({ message: `Signed in as ${sessionUser.username ?? username}.`, tone: 'ok' });
    } finally {
      setAuthPending(false);
    }
  };

  const loginCitizen = async () => {
    const email = loginDraft.email.trim().toLowerCase();
    const password = loginDraft.password;
    if (!email || !password) {
      setFlash({ message: 'Enter email and password.', tone: 'warn' });
      return;
    }

    setAuthPending(true);
    try {
      const result = await authClient.signIn.email({ email, password });

      if (result.error) {
        setFlash({ message: getAuthErrorMessage(result.error, 'Invalid citizen email or password.'), tone: 'warn' });
        return;
      }

      const sessionUser = parseSessionUser(result.data) ?? (await syncCitizenSession());
      if (!sessionUser) {
        setFlash({ message: 'Sign in succeeded, but session could not be loaded.', tone: 'warn' });
        return;
      }

      applySessionUser(sessionUser);
      setLoginMenuOpen(false);
      setRoute('report');
      setFlash({ message: `Signed in as ${sessionUser.username ?? sessionUser.name}.`, tone: 'ok' });
    } finally {
      setAuthPending(false);
    }
  };

  const logout = async () => {
    setAuthPending(true);
    try {
      if (auth.role === 'citizen') {
        await authClient.signOut();
      }
      setAuth({ role: 'public', userId: null, name: 'Public', username: null });
      setLoginMenuOpen(false);
      setRoute('explore');
      setFlash({ message: 'Logged out successfully.', tone: 'ok' });
    } finally {
      setAuthPending(false);
    }
  };

  const handleResolutionProof = (event: ChangeEvent<HTMLInputElement>, id: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setComplaints((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: 'RESOLVED', progressStage: statusToStage['RESOLVED'], afterImage: typeof reader.result === 'string' ? reader.result : undefined }
            : item,
        ),
      );
      setFlash({ message: 'Resolution proof uploaded! Action recorded.', tone: 'ok' });
    };
    reader.readAsDataURL(file);
  };

  const mapFocus = filteredComplaints[0];
  const mapSrc = mapFocus
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapFocus.lng - 0.02}%2C${mapFocus.lat - 0.02}%2C${mapFocus.lng + 0.02
    }%2C${mapFocus.lat + 0.02}&layer=mapnik&marker=${mapFocus.lat}%2C${mapFocus.lng}`
    : '';

  return (
    <div className="theme-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="brand" onClick={() => setRoute('explore')}>
            JanLedger
          </button>
        </div>
        <nav className="topbar-nav" aria-label="Main navigation">
          <button className={`top-link ${route === 'explore' ? 'active' : ''}`} onClick={() => setRoute('explore')}>
            Issues
          </button>
          <button className={`top-link ${route === 'report' ? 'active' : ''}`} onClick={() => setRoute('report')}>
            Report
          </button>
          <button className={`top-link ${route === 'track' ? 'active' : ''}`} onClick={() => setRoute('track')}>
            Tracking
          </button>
        </nav>
        <div className="topbar-actions">
          <button className="icon-button" aria-label="Notifications">
            •
          </button>
          <button
            className={`profile-button ${auth.role !== 'public' ? 'active' : ''}`}
            onClick={() => setLoginMenuOpen((v) => !v)}
            disabled={authPending}
          >
            {auth.role === 'public' ? 'Login' : auth.username ?? auth.name}
          </button>

          {loginMenuOpen ? (
            <div className="login-menu">
              {auth.role === 'public' ? (
                <>
                  <h4>Citizen Access</h4>
                  <input
                    type="email"
                    placeholder="Email"
                    value={loginDraft.email}
                    onChange={(event) => setLoginDraft((prev) => ({ ...prev, email: event.target.value }))}
                    disabled={authPending}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={loginDraft.password}
                    onChange={(event) => setLoginDraft((prev) => ({ ...prev, password: event.target.value }))}
                    disabled={authPending}
                  />
                  <button onClick={() => void loginCitizen()} disabled={authPending}>
                    {authPending ? 'Signing in...' : 'Citizen Login'}
                  </button>
                  <button
                    onClick={() => {
                      setSignupOpen(true);
                      setLoginMenuOpen(false);
                    }}
                    disabled={authPending}
                  >
                    Create Citizen Account
                  </button>
                  <h4>Authority Access</h4>
                  <button
                    onClick={() => {
                      setAuth({ role: 'authority', userId: 'authority-user', name: 'Authority', username: null });
                      setLoginMenuOpen(false);
                      setRoute('authority');
                    }}
                    disabled={authPending}
                  >
                    Authority Login
                  </button>
                </>
              ) : (
                <>
                  <h4>Signed in as {auth.username ?? auth.name}</h4>
                  {auth.role === 'authority' ? <button onClick={() => setRoute('authority')}>Open Authority Panel</button> : null}
                  <button onClick={() => void logout()} disabled={authPending}>
                    {authPending ? 'Logging out...' : 'Logout'}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </header>

      <div className="theme-body">
        <aside className="portal-rail">
          <div className="portal-heading">
            <h2>{auth.role === 'authority' ? 'Authority Panel' : 'Citizen Portal'}</h2>
            <p>{auth.role === 'public' ? 'Public Access' : 'Verified Member'}</p>
          </div>

          {auth.role === 'citizen' && (
            <div className="civic-level-card card-surface" style={{ position: 'relative' }}>
              {(() => {
                const userScore = calculateContributionScore(visibleTrackComplaints);
                const rank = getContributionRank(userScore);

                return (
                  <>
                    <div className="level-flex">
                      <span className="level-title">
                        {rank.icon && <span className="level-icon">{rank.icon}</span>}
                        {rank.name}
                      </span>
                      {rank.current < 100 && (
                        <span
                          className="level-score arrow-clickable"
                          onClick={() => setShowLevelInfo((v) => !v)}
                          style={{ cursor: 'pointer', padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px' }}
                        >
                          {rank.current} / {rank.max} →
                        </span>
                      )}
                    </div>
                    {rank.current < 100 && (
                      <div className="progress-track" title={`${rank.percentage.toFixed(1)}% to next milestone`}>
                        <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, rank.percentage))}%` }}></div>
                      </div>
                    )}

                    {showLevelInfo && (
                      <div className="level-popup" style={{
                        position: 'absolute', top: '100%', right: '0', zIndex: 100,
                        marginTop: '8px', padding: '12px', background: 'white',
                        border: '1px solid #e2e8f0', borderRadius: '8px',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', width: '220px'
                      }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#64748b' }}>Civic Tiers</h4>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.85rem', color: '#333' }}>
                          <li style={{ padding: '4px 0', opacity: rank.current >= 10 ? 0.4 : 1 }}>🥉 Bronze (10 pts)</li>
                          <li style={{ padding: '4px 0', opacity: rank.current >= 25 ? 0.4 : 1 }}>🥈 Silver (25 pts)</li>
                          <li style={{ padding: '4px 0', opacity: rank.current >= 50 ? 0.4 : 1 }}>🥇 Gold (50 pts)</li>
                          <li style={{ padding: '4px 0', opacity: rank.current >= 100 ? 0.4 : 1 }}>💎 Diamond (100+ pts)</li>
                        </ul>
                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#64748b' }}>
                          Report: +1 | High Impact: +2 | Resolved: +3
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <nav className="portal-nav">
            <button className={`portal-link ${route === 'explore' && exploreMode === 'map' ? 'active' : ''}`} onClick={() => { setRoute('explore'); setExploreMode('map'); }}>
              Map View
            </button>
            <button className={`portal-link ${route === 'explore' && exploreMode === 'ledger' ? 'active' : ''}`} onClick={() => { setRoute('explore'); setExploreMode('ledger'); }}>
              Ledger
            </button>
            <button className={`portal-link ${route === 'track' ? 'active' : ''}`} onClick={() => setRoute('track')}>
              Tracking
            </button>
            <button className={`portal-link ${route === 'report' ? 'active' : ''}`} onClick={() => setRoute('report')}>
              Report
            </button>
          </nav>
          <button className="rail-cta" onClick={() => setRoute('report')}>
            New Report
          </button>
        </aside>

        <main className="content-area">
          {flash ? <div className={`flash ${flash.tone}`}>{flash.message}</div> : null}

          {route === 'explore' && exploreMode === 'ledger' ? (
            <>
              <section className="route-head">
                <p className="route-crumb">PUBLIC TRANSPARENCY LAYER</p>
                <h1>Public Audit Ledger</h1>
                <p>An immutable record of civic accountability, infrastructure monitoring, and authority response.</p>
              </section>

              <section className="stats-strip">
                <article className="stat-card card-surface stat-total">
                  <p>Total Entries</p>
                  <h3>{complaints.length}</h3>
                  <span>Up-to-date public records</span>
                </article>
                <article className="stat-card card-surface stat-active">
                  <p>Active Investigations</p>
                  <h3>{complaints.filter((entry) => entry.status !== 'RESOLVED').length}</h3>
                  <span>Average resolution: 4.2 days</span>
                </article>
                <article className="stat-card card-surface stat-resolved">
                  <p>Resolved</p>
                  <h3>{complaints.filter((entry) => entry.status === 'RESOLVED').length}</h3>
                  <span>Public transparency score</span>
                </article>
              </section>

              <section className="ledger-controls card-surface">
                <div className="ledger-tabs">
                  <button className={`top-link ${ledgerFilter === 'all' ? 'active' : ''}`} onClick={() => setLedgerFilter('all')}>
                    All Entries
                  </button>
                  <button className={`top-link ${ledgerFilter === 'investigating' ? 'active' : ''}`} onClick={() => setLedgerFilter('investigating')}>
                    Investigating
                  </button>
                  <button className={`top-link ${ledgerFilter === 'notified' ? 'active' : ''}`} onClick={() => setLedgerFilter('notified')}>
                    Authority Notified
                  </button>
                  <button className={`top-link ${ledgerFilter === 'resolved' ? 'active' : ''}`} onClick={() => setLedgerFilter('resolved')}>
                    Resolved
                  </button>
                </div>
                <input
                  type="search"
                  placeholder="Search by hash or title..."
                  value={ledgerSearch}
                  onChange={(event) => setLedgerSearch(event.target.value)}
                />
              </section>

              <section className="audit-feed">
                {filteredComplaints.length === 0 ? (
                  <article className="card-surface locked-panel">
                    <h1>No matching entries</h1>
                    <p>Try a different filter or clear your search to view more ledger items.</p>
                  </article>
                ) : (
                  filteredComplaints
                    .slice()
                    .sort((a, b) => b.upvotes - a.upvotes)
                    .map((entry) => (
                      <article
                        key={entry.id}
                        className="audit-card card-surface"
                        onClick={() => {
                          setSelectedComplaintId(entry.id);
                          setRoute('track');
                        }}
                      >
                        <div className="audit-left">
                          <div className="audit-tags">
                            <span className="audit-tag">{entry.category}</span>
                            <span className={`audit-tag status ${statusClass(entry.status)}`}>{entry.status}</span>
                            <span className="audit-tag severity">Supports {entry.upvotes}</span>
                          </div>
                          <h3>{entry.title}</h3>
                          <div className="audit-events">
                            {progressStages.map((label, index) => {
                              const state = index < entry.progressStage ? 'done' : index === entry.progressStage ? 'current' : 'pending';
                              return (
                                <div key={`${entry.id}-${label}`} className={`audit-event ${state}`}>
                                  <span className="audit-dot"></span>
                                  <div>
                                    <p>{label}</p>
                                    <small>{entry.createdAt}</small>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <aside className="audit-right" onClick={(event) => event.stopPropagation()}>
                          <img src={entry.image} alt={entry.title} className="audit-image" />
                          <div className="audit-support-row">
                            <strong>👍 {entry.upvotes}</strong>
                            <span>HASH: {entry.hash ? `${entry.hash.slice(0, 10)}...` : entry.id.toLowerCase()}</span>
                          </div>
                          {entry.txHash ? (
                            <div className="blockchain-badge verified compact">
                              <span className="chain-icon">🔗</span>
                              <span>Verified</span>
                            </div>
                          ) : entry.hash ? (
                            <div className="blockchain-badge pending compact">
                              <span className="chain-icon">⏳</span>
                              <span>Pending</span>
                            </div>
                          ) : null}
                          <button className="primary" onClick={() => upvote(entry.id)}>
                            Support
                          </button>
                        </aside>
                      </article>
                    ))
                )}
              </section>
            </>
          ) : null}

          {route === 'explore' && exploreMode === 'map' ? (
            <>
              <section className="route-head">
                <p className="route-crumb">LEDGER · LIVE ISSUES</p>
                <h1>Civic Complaint Map</h1>
                <p>Open complaints and coordinates in one place.</p>
              </section>

              <section className="issues-layout">
                <div className="map-panel card-surface">
                  <div className="section-head">
                    <h2>Complaint Map</h2>
                    <span className="meta-pill">Live Feed</span>
                  </div>
                  {mapFocus ? (
                    <div className="explore-map">
                      <CivicMap lat={mapFocus.lat} lng={mapFocus.lng} complaints={complaints} />
                    </div>
                  ) : (
                    <div className="locked-panel">
                      <h1>No entries loaded</h1>
                      <p>Add data in /public/data/complaints.json or submit reports.</p>
                    </div>
                  )}
                </div>

                <div className="ledger-panel card-surface">
                  <h2>Complaint Ledger</h2>
                  <p className="panel-copy">Click an issue to open full progress tracking.</p>
                  <div className="ledger-list">
                    {complaints
                      .slice()
                      .sort((a, b) => b.upvotes - a.upvotes)
                      .map((entry) => (
                        <article
                          key={entry.id}
                          className="complaint-card"
                          onClick={() => {
                            setSelectedComplaintId(entry.id);
                            setRoute('track');
                          }}
                        >
                          <img src={entry.image} alt={entry.title} className="card-image" />
                          <div className="card-content">
                            <h3>{entry.title}</h3>
                            <p className="card-location">{entry.locationLabel}</p>
                            <div className="card-meta-row">
                              <span className="support-count">{entry.upvotes} supports</span>
                              <span className={`status-chip ${statusClass(entry.status)}`}>{entry.status}</span>
                            </div>
                            <button
                              className="support-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                upvote(entry.id);
                              }}
                            >
                              Support
                            </button>
                          </div>
                        </article>
                      ))}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {route === 'report' ? (
            auth.role !== 'citizen' ? (
              <section className="locked-panel card-surface">
                <h1>Citizen login required</h1>
                <p>Reporting and tracking your own complaints is available after citizen login.</p>
                <button
                  className="primary"
                  onClick={() => {
                    setSignupOpen(true);
                    setLoginMenuOpen(false);
                  }}
                >
                  Create Citizen Account
                </button>
              </section>
            ) : (
              <>
                <section className="route-head">
                  <p className="route-crumb">REPORT · NEW COMPLAINT</p>
                  <h1>Submit Issue Evidence</h1>
                  <p>Upload an image, attach context, and run duplicate-aware AI checks.</p>
                </section>

                <section className="report-layout theme-report-layout">
                  <div className="report-form card-surface">
                    <label className="upload-box" htmlFor="reportImage">
                      {reportDraft.imageData ? (
                        <img src={reportDraft.imageData} alt="Uploaded issue" className="preview-image" />
                      ) : (
                        <div className="upload-copy">
                          <span>Camera Upload</span>
                          <small>Tap to capture or upload issue image</small>
                        </div>
                      )}
                    </label>
                    <input id="reportImage" type="file" accept="image/*" capture="environment" onChange={handleReportImage} />

                    <label htmlFor="reportText">Optional Description</label>
                    <textarea
                      id="reportText"
                      rows={5}
                      placeholder="Add any detail that helps identify the issue"
                      value={reportDraft.text}
                      onChange={(event) => {
                        setReportDraft((prev) => ({ ...prev, text: event.target.value, suggestion: null }));
                        setAnalysisError(null);
                      }}
                    />

                    <div className="location-row">
                      <button className="secondary" onClick={detectLocation}>
                        Auto Detect Location
                      </button>
                      <p>{reportDraft.locationLabel}</p>
                    </div>

                    <button className="primary" onClick={() => void analyzeReport()} disabled={analysisPending}>
                      {analysisPending ? 'Analyzing Image...' : 'Run AI Detection'}
                    </button>
                  </div>

                  <aside className="report-ai-panel card-surface">
                    {analysisPending ? <div className="report-analysis-state loading">Analyzing uploaded image with SCSS...</div> : null}
                    {analysisError ? <div className="report-analysis-state error">{analysisError}</div> : null}
                    {reportDraft.suggestion ? (
                      <div className="suggestion-card">
                        <h3>AI Suggestion</h3>
                        <p>
                          <strong>Issue type:</strong> {reportDraft.suggestion.title}
                        </p>
                        <p>
                          <strong>Category:</strong> {reportDraft.suggestion.category}
                        </p>
                        <p>
                          <strong>Routed to:</strong> {reportDraft.suggestion.routedTo}
                        </p>
                        <p>
                          <strong>Description:</strong> {reportDraft.suggestion.description}
                        </p>
                        {reportDraft.suggestion.source === 'fallback' ? <p><strong>Note:</strong> Using fallback text-based detection.</p> : null}
                        {reportDraft.suggestion.duplicateId ? (
                          <>
                            <div className="duplicate-warning">This issue already exists nearby</div>
                            <button
                              className="primary"
                              onClick={() => {
                                upvote(reportDraft.suggestion!.duplicateId!);
                                setSelectedComplaintId(reportDraft.suggestion!.duplicateId!);
                                setRoute('track');
                              }}
                            >
                              Support Existing Issue
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="new-issue-note">No similar issue found nearby.</div>
                            <button className="primary" onClick={() => void createComplaint()}>
                              Create New Complaint
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="suggestion-card empty">Run analysis to get title, category, and duplicate check.</div>
                    )}
                  </aside>
                </section>
              </>
            )
          ) : null}

          {route === 'track' ? (
            !selectedComplaint ? (
              <section className="locked-panel card-surface">
                <h1>No complaints yet</h1>
                <p>Select a complaint from Explore to view progress.</p>
              </section>
            ) : (
              <>
                <section className="route-head">
                  <p className="route-crumb">LEDGER · CASE {selectedComplaint.id}</p>
                  <h1>{selectedComplaint.title}</h1>
                </section>

                <section className={`track-layout ${auth.role === 'citizen' ? 'with-list' : ''}`}>
                  {auth.role === 'citizen' ? (
                    <aside className="my-list card-surface">
                      <h3>My Complaints</h3>
                      {visibleTrackComplaints.map((entry) => (
                        <button
                          key={entry.id}
                          className={`my-item ${entry.id === selectedComplaint.id ? 'active' : ''}`}
                          onClick={() => setSelectedComplaintId(entry.id)}
                        >
                          <span>{entry.title}</span>
                          <small>{entry.locationLabel}</small>
                        </button>
                      ))}
                    </aside>
                  ) : null}

                  <div className="case-layout">
                    <article className="detail-card card-surface">
                      {selectedComplaint.afterImage ? (
                        <div className="after-split" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                          <figure style={{ flex: 1, margin: 0, position: 'relative' }}>
                            <img src={selectedComplaint.image} alt={selectedComplaint.title} className="detail-image" style={{ width: '100%', borderRadius: '12px', objectFit: 'cover' }} />
                            <figcaption style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>BEFORE</figcaption>
                          </figure>
                          <figure style={{ flex: 1, margin: 0, position: 'relative' }}>
                            <img src={selectedComplaint.afterImage} alt="Resolved" className="detail-image" style={{ width: '100%', borderRadius: '12px', objectFit: 'cover' }} />
                            <figcaption style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(34, 197, 94, 0.9)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>AFTER (RESOLVED)</figcaption>
                          </figure>
                        </div>
                      ) : (
                        <img src={selectedComplaint.image} alt={selectedComplaint.title} className="detail-image" />
                      )}

                      <div className="detail-main">
                        <div className="detail-meta top">
                          <span className={`status-chip ${statusClass(selectedComplaint.status)}`}>{selectedComplaint.status}</span>
                          <span>{selectedComplaint.upvotes} supports</span>
                        </div>
                        <p className="detail-copy">{selectedComplaint.description}</p>
                        <div className="detail-sub-grid">
                          <div>
                            <p className="label">Submitted On</p>
                            <strong>{selectedComplaint.createdAt}</strong>
                          </div>
                          <div>
                            <p className="label">Location</p>
                            <strong>{selectedComplaint.locationLabel}</strong>
                          </div>
                        </div>

                        {/* Blockchain verification badge */}
                        <div className="blockchain-badge-wrap">
                          {selectedComplaint.txHash ? (
                            <a
                              className="blockchain-badge verified"
                              href={`https://amoy.polygonscan.com/tx/${selectedComplaint.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span className="chain-icon">🔗</span>
                              <span>Verified on Blockchain</span>
                              <code>{selectedComplaint.txHash.slice(0, 6)}...{selectedComplaint.txHash.slice(-4)}</code>
                            </a>
                          ) : selectedComplaint.hash ? (
                            <div className="blockchain-badge pending">
                              <span className="chain-icon">⏳</span>
                              <span>Pending blockchain verification...</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>

                    <aside className="assignment-panel card-surface">
                      <h3>Official Assignment</h3>
                      <p className="assignment-name">Dept: {selectedComplaint.routedTo}</p>
                      <p className="assignment-id">Case ID: {selectedComplaint.id}</p>

                      {auth.role === 'authority' ? (
                        <div className="authority-quick-actions" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#64748b' }}>Update Case Status</h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            {selectedComplaint.status === 'RESOLVED' && selectedComplaint.afterImage ? (
                              <>
                                <span className={`status-chip status-resolved`}>RESOLVED</span>
                                <img src={selectedComplaint.afterImage} alt="Proof" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }} />
                              </>
                            ) : (
                              <>
                                <select
                                  value={selectedComplaint.status}
                                  onChange={(event) => {
                                    const newStatus = event.target.value as Status;
                                    if (newStatus === 'RESOLVED') {
                                      const fileDialog = document.getElementById(`proof-track-${selectedComplaint.id}`);
                                      if (fileDialog) fileDialog.click();
                                      event.target.value = selectedComplaint.status;
                                    } else {
                                      setComplaints((prev) =>
                                        prev.map((item) =>
                                          item.id === selectedComplaint.id
                                            ? { ...item, status: newStatus, progressStage: statusToStage[newStatus] }
                                            : item,
                                        ),
                                      );
                                    }
                                  }}
                                >
                                  <option value="CRITICAL">CRITICAL</option>
                                  <option value="IN PROGRESS">IN PROGRESS</option>
                                  <option value="RESOLVED">RESOLVED</option>
                                  <option value="SCHEDULED">SCHEDULED</option>
                                </select>
                                <input
                                  id={`proof-track-${selectedComplaint.id}`}
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  onChange={(e) => handleResolutionProof(e, selectedComplaint.id)}
                                />
                              </>
                            )}
                          </div>
                          <button className="secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setRoute('authority')}>
                            ← Back to Authority Panel
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="detail-actions">
                            <button className="primary" onClick={() => upvote(selectedComplaint.id)}>
                              Support
                            </button>
                            <button
                              className="secondary"
                              onClick={async () => {
                                const payload = `JanLedger Issue: ${selectedComplaint.title} | ${selectedComplaint.locationLabel}`;
                                if (navigator.share) {
                                  await navigator.share({ title: selectedComplaint.title, text: payload });
                                  return;
                                }
                                await navigator.clipboard.writeText(payload);
                                setFlash({ message: 'Share text copied to clipboard.', tone: 'ok' });
                              }}
                            >
                              Share
                            </button>
                          </div>
                          <div className="help-card">
                            <h4>Need an update?</h4>
                            <p>Connect directly with the assigned civic representative for this case.</p>
                            <button className="secondary">Contact Representative</button>
                          </div>
                        </>
                      )}
                    </aside>

                    <section className="progress-ledger card-surface">
                      <div className="progress-header">
                        <h3>Progress Ledger</h3>
                        <span>Live Tracking</span>
                      </div>
                      <ol className="tracker">
                        {progressStages.map((stage, index) => {
                          const done = index < selectedComplaint.progressStage;
                          const current = index === selectedComplaint.progressStage;
                          return (
                            <li key={stage} className={`tracker-step ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
                              <span className="step-dot">{index + 1}</span>
                              <span className="step-text">{stage}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  </div>
                </section>
              </>
            )
          ) : null}

          {route === 'authority' ? (
            auth.role !== 'authority' ? (
              <section className="locked-panel card-surface">
                <h1>Authority login required</h1>
                <p>Status updates are restricted to authority accounts.</p>
                <button
                  className="primary"
                  onClick={() => {
                    setAuth({ role: 'authority', userId: 'authority-user', name: 'Authority', username: null });
                    setRoute('authority');
                  }}
                >
                  Login as Authority
                </button>
              </section>
            ) : (
              <>
                <section className="page-header">
                  <p className="kicker">Authority panel</p>
                  <h1>Manage complaint status updates</h1>
                  <p>Simple workflow for CRITICAL, IN PROGRESS, RESOLVED, and SCHEDULED.</p>
                </section>
                <section className="authority-table-wrap card-surface">
                  <table className="authority-table">
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>Location</th>
                        <th>Upvotes</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {complaints.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No complaints loaded. Add data in /public/data/complaints.json.</td>
                        </tr>
                      ) : (
                        complaints.map((entry) => (
                          <tr
                            key={entry.id}
                            onClick={() => {
                              setSelectedComplaintId(entry.id);
                              setRoute('track');
                            }}
                            style={{ cursor: 'pointer' }}
                            className="hover-row"
                          >
                            <td>{entry.title}</td>
                            <td>{entry.locationLabel}</td>
                            <td>{entry.upvotes}</td>
                            <td>
                              <span className={`status-chip ${statusClass(entry.status)}`}>{entry.status}</span>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="status-action" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {entry.status === 'RESOLVED' && entry.afterImage ? (
                                  <>
                                    <span className={`status-chip status-resolved`}>RESOLVED</span>
                                    <img src={entry.afterImage} alt="Proof" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }} />
                                  </>
                                ) : (
                                  <>
                                    <select
                                      value={entry.status}
                                      onChange={(event) => {
                                        const newStatus = event.target.value as Status;
                                        if (newStatus === 'RESOLVED') {
                                          const fileDialog = document.getElementById(`proof-${entry.id}`);
                                          if (fileDialog) fileDialog.click();
                                          event.target.value = entry.status; // Revert select visually until file resolves
                                        } else {
                                          setComplaints((prev) =>
                                            prev.map((item) =>
                                              item.id === entry.id
                                                ? { ...item, status: newStatus, progressStage: statusToStage[newStatus] }
                                                : item,
                                            ),
                                          );
                                        }
                                      }}
                                    >
                                      <option value="CRITICAL">CRITICAL</option>
                                      <option value="IN PROGRESS">IN PROGRESS</option>
                                      <option value="RESOLVED">RESOLVED</option>
                                      <option value="SCHEDULED">SCHEDULED</option>
                                    </select>
                                    <input
                                      id={`proof-${entry.id}`}
                                      type="file"
                                      accept="image/*"
                                      style={{ display: 'none' }}
                                      onChange={(e) => handleResolutionProof(e, entry.id)}
                                    />
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </section>
              </>
            )
          ) : null}

          <footer className="content-footer">
            <p>JanLedger</p>
            <span>A transparent civic tracking interface.</span>
          </footer>
        </main>
      </div>

      {signupOpen ? (
        <div className="modal-backdrop" onClick={() => setSignupOpen(false)}>
          <section className="signup-modal card-surface" onClick={(event) => event.stopPropagation()}>
            <div className="signup-head">
              <h2>Create Citizen Account</h2>
              <button className="secondary" onClick={() => setSignupOpen(false)}>
                Close
              </button>
            </div>

            <label>Name</label>
            <input
              type="text"
              value={signupDraft.name}
              onChange={(event) => setSignupDraft((prev) => ({ ...prev, name: event.target.value }))}
            />

            <label>Number</label>
            <input
              type="tel"
              value={signupDraft.phone}
              onChange={(event) => setSignupDraft((prev) => ({ ...prev, phone: event.target.value }))}
            />

            <label>Email</label>
            <input
              type="email"
              value={signupDraft.email}
              onChange={(event) => setSignupDraft((prev) => ({ ...prev, email: event.target.value }))}
            />

            <div className="username-row">
              <div>
                <label>Auto-generated Username</label>
                <input type="text" value={signupDraft.username} readOnly />
              </div>
              <button
                className="secondary"
                onClick={() => setSignupDraft((prev) => ({ ...prev, username: generateUsername(prev.name) }))}
              >
                Regenerate
              </button>
            </div>

            <label>Password</label>
            <input
              type="password"
              value={signupDraft.password}
              onChange={(event) => setSignupDraft((prev) => ({ ...prev, password: event.target.value }))}
            />

            <button className="primary" onClick={() => void createCitizenAccount()} disabled={authPending}>
              {authPending ? 'Creating...' : 'Create Account'}
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
