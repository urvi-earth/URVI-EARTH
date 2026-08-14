import { db, ref, get, child, update, onValue } from "../config.js";

/* =====================================================
   URVI – index.js  |  Dashboard Module
   ===================================================== */

// ── Session ──────────────────────────────────────────
const rawUserId = localStorage.getItem('urvi_logged_user');
const loggedInUserId =
  rawUserId && rawUserId !== "undefined" && rawUserId !== "null"
    ? rawUserId.trim()
    : null;

// ── Feature Content Map ───────────────────────────────
const featureDataDetails = {
  "virtual-tree": {
    icon: "🌲",
    title: "Virtual Tree System",
    text: `Your virtual tree is a 1:1 digital twin of your real-world planting progress.<br><br>
    • Watch your tree grow from a seedling to a mature canopy as you participate in real drives.<br>
    • Earn foliage points by maintaining regular watering and soil checking updates.<br>
    • Share your plant's status directly to the community forum with dynamic geo-tags.<br>
    • Every user receives their first starter virtual seedling automatically on signup.<br>
    • Track global reforestation metrics and view carbon offset totals in real time.<br>
    • Unlock specialized seasonal virtual plants based on your environmental contributions.<br>
    • Integrated with global climate indexes to simulate local weather effects.<br>
    • Compare growth cycles with global eco-campaigns directly on your dashboard.<br>
    • High-definition growth renders track real foliage milestones dynamically.<br>
    • Connect your planting stats directly to international tree registries.`
  },
  "leaderboard": {
    icon: "🏆",
    title: "Urvi Impact Leaderboard",
    text: `Compare your carbon offsets against global change-makers directly on our dashboard.<br><br>
    • Filter metrics by global, regional, or campus networks to view active standings.<br>
    • Top environmental champions are updated weekly with certified gold badge awards.<br>
    • View active profiles and track which communities are planting the most saplings.<br>
    • Gain ranking points for every verified picture upload of soil restoration drives.<br>
    • Monthly ecosystem rewards are automatically shipped to our top 5 active members.<br>
    • Share community leaderboards to invite surrounding networks to join hands.<br>
    • Transparent metrics are monitored to guarantee authentic activity logs.<br>
    • Seasonal challenges offer temporary double-point events to boost your status.<br>
    • View volunteer activity heatmaps directly beside current user metrics.<br>
    • Team standings allow schools and offices to compete on a global green scale.`
  },
  "wallet": {
    icon: "👛",
    title: "Eco Green Wallet",
    text: `Accumulate URVI credit coins for every verified environmental action you complete.<br><br>
    • Gain credit points for every sapling planted or waste removal drive organized.<br>
    • Points are directly verified using geo-tagged photographs and timestamp logs.<br>
    • Redeem credits in the eco-merchandise store for sustainable product alternatives.<br>
    • Access unique eco-friendly discount coupons with our partner green brands.<br>
    • Easily transfer gift points to friends to encourage joint community action.<br>
    • View a comprehensive ledger of every green point you have earned and spent.<br>
    • Points are stored safely in your secured local workspace directory.<br>
    • Green wallets receive automatic carbon credit payouts for verified maintenance.<br>
    • Earn multipliers on points by attending three consecutive campaigns.<br>
    • Standard membership tiers scale directly with your cumulative wallet history.`
  },
  "certificates": {
    icon: "📜",
    title: "Urvi Carbon Certificates",
    text: `Receive official URVI digital certificates for your verifiable contribution to carbon capture.<br><br>
    • Every certificate features a unique QR code linked directly to our database registry.<br>
    • Showcase certified ecological contributions on your LinkedIn or professional profiles.<br>
    • Certificates are endorsed by global environmental restoration bodies.<br>
    • Download high-definition copies ready for physically printing or framing.<br>
    • Earn milestone certificates at 10, 50, and 100 verified tree plantings.<br>
    • Every document outlines verified metrics detailing exactly where your efforts went.<br>
    • Access your entire environmental vault securely from any device.<br>
    • Share custom climate badges with peer networks to amplify awareness.<br>
    • Track real coordinates of physical trees linked to your individual certificates.<br>
    • Corporate tiers are available for commercial carbon neutral compliance.`
  },
  "rewards": {
    icon: "🎉",
    title: "Eco-Friendly Rewards",
    text: `Unlock exciting rewards and physical botanical kits shipped directly to your door.<br><br>
    • Swap points for natural seed capsules, plantable pens, and bamboo utensils.<br>
    • Gain exclusive early-bird invitations to primary national environment summits.<br>
    • Access specialized environmental masterclasses led by leading green advocates.<br>
    • Unlock digital profile customization frames and special status tags.<br>
    • Top-tier performers receive physical URVI badges and volunteer shirts.<br>
    • Participate in seasonal draws to win fully paid trips to national sanctuaries.<br>
    • Exchange carbon points directly for physical saplings planted in your honor.<br>
    • Earn badges by checking in on-site at three consecutive city cleaning runs.<br>
    • Unlock digital profile overlays to verify your elite volunteer credentials.<br>
    • Connect with partner organic networks to access zero-waste supplies.`
  },
  "campaigns": {
    icon: "📍",
    title: "Local Nearby Campaigns",
    text: `Find verified physical cleanup drives and planting initiatives around your city.<br><br>
    • Pinpoint verified activities on your built-in interactive green map.<br>
    • Register for runs in advance to reserve essential sapling planting tools.<br>
    • Filter events by category: soil cleanup, seedball dispersal, or lake restoration.<br>
    • Coordinate directly with community leaders via local campaign comment chats.<br>
    • Submit customized drive proposals to turn your local park into a green space.<br>
    • Earn double reward coins by joining registered weekend cleanup drives.<br>
    • Check-in on-site seamlessly using real-time location check coordinates.<br>
    • Access specialized safety guides before arriving at localized sites.<br>
    • View active participant headcounts to find major volunteer initiatives.<br>
    • Connect with municipal networks to coordinate major trash collection days.`
  }
};

// ── Bootstrap ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initializePageThemeAndState();
  initDynamicCounters();
  setupFeatureModalHandlers();
});

// =====================================================
//  Core: Initialize Page Based on Auth State
// =====================================================
async function initializePageThemeAndState() {
  const greetingText = document.getElementById('user-greeting');
  const greetingSubtitle = document.getElementById('user-subtitle');
  const mainCard = document.getElementById('main-impact-card');
  const sidebarProfile = document.getElementById('sidebar-profile-box');
  const topHeaderProfile = document.getElementById('top-header-profile');

  // ── ALWAYS load campaigns + past events + global_impact for everyone ──
  loadPublicSections();

  if (!loggedInUserId) {
    // Guest view
    renderGuestState(greetingText, greetingSubtitle, mainCard, sidebarProfile, topHeaderProfile);
    return;
  }

  // ── 0ms Instant Cache Load from LocalStorage ──
  const cachedUserData = localStorage.getItem("urvi_user_data");
  if (cachedUserData) {
    try {
      const cachedUser = JSON.parse(cachedUserData);
      renderLoggedInState(cachedUser, greetingText, greetingSubtitle, mainCard, sidebarProfile, topHeaderProfile);
    } catch (e) { /* ignore */ }
  }

  // ── Logged In: background sync user from Firebase ──
  try {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, `users/${loggedInUserId}`));

    if (!snapshot.exists()) {
      localStorage.removeItem('urvi_logged_user');
      localStorage.removeItem('urvi_user_data');
      renderGuestState(greetingText, greetingSubtitle, mainCard, sidebarProfile, topHeaderProfile);
      return;
    }

    const user = snapshot.val();
    localStorage.setItem("urvi_user_data", JSON.stringify(user));
    renderLoggedInState(user, greetingText, greetingSubtitle, mainCard, sidebarProfile, topHeaderProfile);
  } catch (err) {
    console.error("Dashboard sync error:", err);
  }
}

function renderUserAvatar(user, cls = "profile-img-small") {
  const pic = user ? (user.profilePic || user.profile_pic || user.photoURL) : null;
  const name = user ? (user.firstName || user.first_name || user.name || "U") : "U";
  const initial = name.charAt(0).toUpperCase();

  const cleanHandle = String(user ? (user.user_id || user.userId || "") : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanName = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
  const role = String(user ? (user.role || user.userType || user.user_type || "") : "").toLowerCase();

  const isGold = cleanHandle.includes("urviearth") || cleanName.includes("urviearth") || role === "admin";
  const isBlue = user && (user.role === "verified" || user.isVerified === true);
  const ringCls = isGold ? "avatar-ring-gold" : (isBlue ? "avatar-ring-blue" : "");

  if (pic && pic !== "default" && pic.length > 5) {
    return `<img src="${pic}" class="${cls} ${ringCls}" alt="${name}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;
  }
  return `<div class="${cls} ${ringCls}" style="width:36px;height:36px;border-radius:50%;background:var(--forest-green);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">${initial}</div>`;
}

function renderLoggedInState(user, greetingText, greetingSubtitle, mainCard, sidebarProfile, topHeaderProfile) {
    const firstName = user.firstName || user.first_name || user.name || user.displayName || user.username || "Volunteer";
    const lastName = user.lastName || user.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();
    const points = user.points !== undefined ? user.points : 0;
    const contributions = user.contributions !== undefined ? user.contributions : 0;
    const trees = user.trees_planted !== undefined ? user.trees_planted : 0;
    const avatarHTML = renderUserAvatar(user, 'profile-img-small');

    // Time-of-day greeting
    const hours = new Date().getHours();
    let timeGreeting = "Good Morning";
    if (hours >= 12 && hours < 17) timeGreeting = "Good Afternoon";
    else if (hours >= 17 || hours < 5) timeGreeting = "Good Evening";

    if (greetingText) greetingText.innerHTML = `${timeGreeting}, ${firstName}! 🌿`;
    if (greetingSubtitle) greetingSubtitle.innerText = "Every action you take creates a greener tomorrow.";

    // Top header: name chip + points + clickable avatar
    if (topHeaderProfile) {
      topHeaderProfile.innerHTML = `
        <div class="header-user-pill">
          <a href="profile/profile.html" class="header-user-info text-decoration-none">
            <span class="header-user-name">${firstName}</span>
            <span class="header-user-points"><i class="bi bi-star-fill"></i> ${points} pts</span>
          </a>
          <a href="profile/profile.html" class="d-inline-block">
            ${avatarHTML}
          </a>
        </div>
      `;
    }


    // Desktop sidebar: user card + logout
    if (sidebarProfile) {
      sidebarProfile.innerHTML = `
        <small class="d-block mb-2" style="color: var(--text-light); font-size: 10px;">Logged in as</small>
        <div class="d-flex align-items-center gap-2">
          ${avatarHTML}
          <div style="min-width: 0;">
            <div class="fw-bold text-truncate" style="font-size: 0.82rem; max-width: 130px; color: var(--text-dark);">${fullName}</div>
            <div style="font-size: 10px; color: var(--bright-green);">${(user.userType === 'admin' || user.user_type === 'admin') ? '🛡 URVI Admin' : '🌿 Eco Member'}</div>
          </div>
        </div>
        <button class="eco-btn w-100 mt-3" id="sidebar-logout-btn"
          style="background: #FEE2E2; color: var(--error-red); font-size: 11px; padding: 7px 12px; border-radius: 10px; font-weight: 600; border: none; cursor: pointer;">
          Logout
        </button>
      `;

      document.getElementById('sidebar-logout-btn')?.addEventListener('click', () => {
        localStorage.removeItem('urvi_logged_user');
        window.location.reload();
      });
    }

    // Impact card with live stats
    if (mainCard) {
      mainCard.innerHTML = `
        <h2 class="impact-title fw-bold">Your Impact Workspace</h2>
        <p class="small mb-3" style="opacity: 0.85;">
          Thank you for contributing to the URVI greenery initiative. Here is your live ecological footprint:
        </p>
        <div class="stats-row mb-3">
          <div class="stat-metric">
            <h4 id="stat-points">${points}</h4>
            <span>Green Points</span>
          </div>
          <div class="stat-metric">
            <h4 id="stat-contrib">${contributions}</h4>
            <span>Contributions</span>
          </div>
          <div class="stat-metric">
            <h4 id="stat-trees">${trees}</h4>
            <span>Trees Planted</span>
          </div>
        </div>
        <button class="impact-btn" onclick="window.location.href='profile/profile.html'">View My Forest Profile</button>
        <div class="circle-icon">🍃</div>
      `;
    }
}

// =====================================================
//  Load Public Sections (Campaigns & Events from RTDB)
// =====================================================
async function loadPublicSections() {
  // 1. Fetch Upcoming Campaigns from Firebase RTDB
  try {
    const eventsSnap = await get(child(ref(db), 'events'));
    let eventsList = [];
    if (eventsSnap.exists()) {
      const data = eventsSnap.val();
      eventsList = Object.keys(data).map(k => ({ id: k, ...data[k] }));
    }
    
    // Filter active/upcoming only
    let activeCampaigns = eventsList.filter(c => c.status !== "cancelled" && c.status !== "completed");

    // Remove duplicates by title & ID
    const seenTitles = new Set();
    activeCampaigns = activeCampaigns.filter(c => {
      const titleKey = (c.title || "").trim().toLowerCase();
      if (!titleKey || seenTitles.has(titleKey)) return false;
      seenTitles.add(titleKey);
      return true;
    });

    // Sort newest updated / created first
    activeCampaigns.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));

    populateCampaigns(activeCampaigns.slice(0, 3));
  } catch (err) {
    console.warn("Homepage events fetch error:", err);
    populateCampaigns([]);
  }

  // 2. Fetch Past Milestones from Firebase RTDB
  try {
    let pastList = [];
    const pastSnap = await get(child(ref(db), 'past_events'));
    if (pastSnap.exists()) {
      const pData = pastSnap.val();
      pastList = Object.keys(pData).map(k => ({ id: k, ...pData[k] }));
    }

    const eventsSnap = await get(child(ref(db), 'events'));
    if (eventsSnap.exists()) {
      const data = eventsSnap.val();
      Object.keys(data).forEach(k => {
        if (data[k].status === "completed") {
          pastList.push({ id: k, ...data[k] });
        }
      });
    }

    // Remove duplicates by title & ID
    const seenPast = new Set();
    pastList = pastList.filter(e => {
      const titleKey = (e.title || "").trim().toLowerCase();
      if (!titleKey || seenPast.has(titleKey)) return false;
      seenPast.add(titleKey);
      return true;
    });

    // Sort newest updated / completed first
    pastList.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));

    populatePastEvents(pastList.slice(0, 3));
  } catch (err) {
    console.warn("Homepage past events fetch error:", err);
    populatePastEvents([]);
  }

  try {
    // Global Impact Counters
    const globalSnap = await get(child(ref(db), 'global_impact'));
    if (globalSnap.exists()) {
      const g = globalSnap.val();
      const setTarget = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.setAttribute('data-target', val);
      };
      setTarget('global-stat-trees', g.trees);
      setTarget('global-stat-volunteers', g.volunteers);
      setTarget('global-stat-campaigns', g.campaigns);
      setTarget('global-stat-points', g.points);
    }
  } catch {
    // Counters use HTML defaults
  }
}


// =====================================================
//  Guest State Renderer
// =====================================================
function renderGuestState(greetingText, greetingSubtitle, mainCard, sidebarProfile, topHeaderProfile) {
  greetingText.innerHTML = `Welcome to URVI 👋`;
  greetingSubtitle.innerText = "Join our greenery initiative and create a better tomorrow.";

  if (sidebarProfile) {
    sidebarProfile.innerHTML = `
      <small class="d-block mb-2" style="color: var(--text-light); font-size: 10px;">Access Dashboard</small>
      <a href="logins/login.html" class="eco-btn d-block text-center text-decoration-none" style="font-size: 0.82rem; padding: 10px;">
        Log In / Sign Up
      </a>
    `;
  }

  topHeaderProfile.innerHTML = `
    <a href="logins/login.html"
       class="text-decoration-none fw-bold"
       style="font-size: 0.78rem; padding: 7px 16px; border-radius: 40px;
              background: var(--light-green-bg); color: var(--forest-green);
              border: 1.5px solid rgba(34,197,94,0.35); transition: all 0.3s;">
      Log In
    </a>
  `;

  mainCard.innerHTML = `
    <h2 class="impact-title fw-bold">About URVI</h2>
    <div class="impact-tagline fw-bold text-uppercase small mb-2">Grow Trees.<br>Build a Better Tomorrow.</div>
    <h3 class="impact-value my-2">400+ Contributors</h3>
    <p class="mb-3" style="opacity: 0.88;">
      Join thousands of volunteers making the planet greener through tree plantations,
      environmental campaigns, and sustainability initiatives.
    </p>
    <button class="impact-btn" onclick="window.location.href='logins/login.html'">Join URVI Initiative</button>
    <div class="circle-icon">🍃</div>
  `;

  setupGuestClickBlocks();
}


// =====================================================
//  Guest Click Blocks
// =====================================================
function setupGuestClickBlocks() {
  document.querySelectorAll('.guest-restricted').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      triggerToastAlert("🔒 Please Log In to access this feature.");
    });
  });
}

// =====================================================
//  Toast Alert
// =====================================================
function triggerToastAlert(message) {
  const toast = document.getElementById('custom-alert-toast');
  const toastMsg = document.getElementById('toast-message');

  if (!toast || !toastMsg) {
    console.warn("Toast elements not found in DOM.");
    return;
  }

  toastMsg.innerText = message;
  toast.classList.remove('hidden');

  clearTimeout(toast._toastTimer);
  toast._toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// =====================================================
//  Populate Campaigns (Preview Top 3 Real Firebase Events)
// =====================================================
function populateCampaigns(campaigns) {
  const container = document.getElementById('campaigns-container');
  if (!container) return;
  container.innerHTML = '';

  if (!campaigns || campaigns.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-4">
        <p class="text-muted small m-0" style="font-size:13px;">Not any events yet conducted.</p>
      </div>
    `;
    return;
  }

  const previewCampaigns = campaigns.slice(0, 3);

  previewCampaigns.forEach(c => {
    const card = document.createElement('div');
    card.className = "custom-card p-0 overflow-hidden d-flex flex-column justify-content-between";
    const pCount = c.participants ? Object.keys(c.participants).length : (c.participantsCount || 0);
    const hasCustomBanner = c.bannerUrl || c.imageUrl;
    const bannerImg = hasCustomBanner || "assets/logo.png";
    const pointsReward = c.points || 100;

    const bannerMarkup = hasCustomBanner ? `
      <div class="card-img-wrapper position-relative" style="height: 140px; overflow: hidden; background: #0F172A;">
        <img src="${bannerImg}" class="w-100 h-100" style="object-fit: cover;" alt="${c.title}" onerror="this.src='assets/logo.png'">
        <span class="badge position-absolute top-0 end-0 m-3 fw-bold shadow-sm" style="background: rgba(245, 158, 11, 0.95); color: #0F172A; font-size: 10px; padding: 4px 10px; border-radius: 30px; z-index: 2;">
          <i class="bi bi-star-fill me-1"></i> ${pointsReward} Eco Pts
        </span>
      </div>
    ` : `
      <div class="card-img-wrapper position-relative d-flex align-items-center justify-content-center" style="height: 130px; overflow: hidden; background: linear-gradient(135deg, #14532D 0%, #15803D 50%, #22C55E 100%);">
        <span class="badge position-absolute top-0 end-0 m-3 fw-bold shadow-sm" style="background: rgba(245, 158, 11, 0.95); color: #0F172A; font-size: 10px; padding: 4px 10px; border-radius: 30px; z-index: 2;">
          <i class="bi bi-star-fill me-1"></i> ${pointsReward} Eco Pts
        </span>
        <img src="${bannerImg}" style="max-height: 75px; width: auto; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));" alt="${c.title}">
      </div>
    `;

    card.innerHTML = `
      ${bannerMarkup}
      <div class="p-3 d-flex flex-column justify-content-between flex-grow-1">
        <div>
          <div class="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
            <span class="badge bg-success-subtle text-success rounded-pill px-3 py-1 fw-semibold text-truncate" style="max-width: 60%; font-size: 10px;">
              ${c.tag || c.category || 'Campaign'}
            </span>
            <small class="text-muted fw-semibold flex-shrink-0" style="font-size: 10px;">
              <i class="bi bi-people-fill text-success me-1"></i>${pCount} Joined
            </small>
          </div>
          <h5 class="fw-bold text-dark mb-1 text-truncate" style="font-size: 0.95rem;">${c.title}</h5>
          <p class="small text-muted mb-3" style="font-size: 11px; height: 34px; overflow: hidden; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
            ${c.desc || c.description || 'Join our community drive.'}
          </p>
        </div>
        <div class="border-top pt-2 mt-auto">
          <div class="d-flex align-items-center gap-2 mb-2 text-muted small" style="font-size: 11px;">
            <i class="bi bi-calendar-event text-primary flex-shrink-0"></i>
            <span class="text-truncate">${c.date || c.eventDate || 'Upcoming'}</span>
          </div>
          <a href="activities/activities.html" class="eco-btn w-100 text-center text-decoration-none d-block py-2 rounded-pill fw-bold" style="font-size:12px;">
            <i class="bi bi-arrow-right-circle me-1"></i> View Drive Details
          </a>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Remove duplicate bottom box if present to avoid extra double button
  const oldViewAllBox = document.getElementById("campaigns-view-all-box");
  if (oldViewAllBox) oldViewAllBox.remove();
}

// =====================================================
//  Populate Past Events (Preview Top 3 Real Milestones)
// =====================================================
function populatePastEvents(events) {
  const container = document.getElementById('past-events-container');
  if (!container) return;
  container.innerHTML = '';

  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-4">
        <p class="text-muted small m-0" style="font-size:13px;">Not any events yet conducted.</p>
      </div>
    `;
    return;
  }

  const previewPast = events.slice(0, 3);

  previewPast.forEach(e => {
    const col = document.createElement('div');
    col.className = "col-12 col-md-4";
    col.innerHTML = `
      <div class="custom-card d-flex flex-column justify-content-between p-3 h-100">
        <div>
          <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
            <div class="feature-icon-circle flex-shrink-0" style="width:38px; height:38px; margin:0; font-size:18px;">🌿</div>
            <span class="badge" style="background: var(--light-green-bg); color: var(--mid-green); font-size: 9px;
                         padding: 4px 8px; border-radius: 20px; font-weight: 700; white-space: nowrap;">
              Completed
            </span>
          </div>
          <h5 class="h6 fw-bold mb-1 text-truncate" style="color: var(--text-dark);">${e.title}</h5>
          <p class="mb-2" style="font-size: 11px; color: var(--text-light);">
            <i class="bi bi-calendar-event me-1"></i>${e.date || 'Past Event'} • ${e.location || 'Site Location'}
          </p>
        </div>
        <div class="d-flex gap-3 pt-2 border-top mt-2">
          <span style="font-size: 11px;">
            <strong style="color: var(--bright-green);">${e.trees || 0}</strong>
            <span style="color: var(--text-light);"> Trees</span>
          </span>
          <span style="font-size: 11px;">
            <strong style="color: var(--bright-green);">${e.volunteers || 0}</strong>
            <span style="color: var(--text-light);"> Volunteers</span>
          </span>
        </div>
      </div>
    `;
    container.appendChild(col);
  });
}

// =====================================================
//  Animated Counters (Intersection Observer)
// =====================================================
function initDynamicCounters() {
  const counters = document.querySelectorAll('.count-number');

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const counter = entry.target;
      const target = parseInt(counter.getAttribute('data-target')) || 0;
      const duration = 1500;
      const startTime = performance.now();

      const tick = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        counter.innerText = Math.floor(ease * target).toLocaleString();
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          counter.innerText = target.toLocaleString() + "+";
        }
      };

      requestAnimationFrame(tick);
      obs.unobserve(counter);
    });
  }, { threshold: 0.25 });

  counters.forEach(c => observer.observe(c));
}

// =====================================================
//  Feature Modal Handlers
// =====================================================
function setupFeatureModalHandlers() {
  const featureRoutes = {
    "virtual-tree": "profile/my-virtual-tree.html",
    "leaderboard": "impact/impact.html",
    "wallet": "profile/profile.html",
    "certificates": "profile/mycertificates.html",
    "rewards": "profile/profile.html",
    "campaigns": "activities/activities.html"
  };

  document.querySelectorAll('.read-more-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.getAttribute('data-feature');
      if (key && featureRoutes[key]) {
        window.location.href = featureRoutes[key];
      }
    });
  });
}
