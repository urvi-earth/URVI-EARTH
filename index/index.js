import { db, ref, get, child, set, push, update, onValue } from "../config.js";
import { uploadToCloudinaryDetailed, isVideoUrl } from "../cloudinary.js";

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
  initStoriesEngine();
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
  if (cachedUserData && loggedInUserId) {
    try {
      const cachedUser = JSON.parse(cachedUserData);
      const matchesCurrent = !cachedUser.user_id ||
        cachedUser.user_id.toLowerCase() === loggedInUserId.toLowerCase() ||
        (cachedUser.auth_uid && cachedUser.auth_uid === loggedInUserId) ||
        (cachedUser.email && cachedUser.email.toLowerCase() === loggedInUserId.toLowerCase()) ||
        loggedInUserId.toLowerCase() === "urvi.earth";
      if (matchesCurrent) {
        renderLoggedInState(cachedUser, greetingText, greetingSubtitle, mainCard, sidebarProfile, topHeaderProfile);
      } else {
        localStorage.removeItem("urvi_user_data");
      }
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
    "campaigns": "impact/impact.html"
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

// =====================================================
//  Real-Time 24-Hour Stories Engine
// =====================================================
let choiceModalInstance = null;
let uploadStoryModalInstance = null;
let selectedStoryFile = null;

let storiesByUser = {};
let storyUserKeys = [];
let currentStoryUserIdx = 0;
let currentStoryItemIdx = 0;
let storyStepTimer = null;
let storyAnimationReq = null;
let storyCurrentDuration = 5000;
let storyProgressStart = 0;

function getSeenStoryIds() {
  try {
    return JSON.parse(localStorage.getItem("urvi_seen_story_ids") || "[]");
  } catch {
    return [];
  }
}

function markStoryAsSeen(storyId) {
  if (!storyId) return;
  const seen = getSeenStoryIds();
  if (!seen.includes(storyId)) {
    seen.push(storyId);
    try {
      localStorage.setItem("urvi_seen_story_ids", JSON.stringify(seen.slice(-200)));
    } catch { /* ignore */ }
  }
}

function initStoriesEngine() {
  const choiceModalEl = document.getElementById("storyPostChoiceModal");
  const uploadModalEl = document.getElementById("uploadStoryModal");

  // Prevent guests from opening story modals
  uploadModalEl?.addEventListener("show.bs.modal", function (e) {
    if (!loggedInUserId) {
      e.preventDefault();
      alert("Please log in to keep stories on URVI!");
      window.location.href = "logins/login.html";
    }
  });

  choiceModalEl?.addEventListener("show.bs.modal", function (e) {
    if (!loggedInUserId) {
      e.preventDefault();
      alert("Please log in to add stories or posts!");
      window.location.href = "logins/login.html";
    }
  });

  if (window.bootstrap && window.bootstrap.Modal) {
    if (choiceModalEl) choiceModalInstance = new window.bootstrap.Modal(choiceModalEl);
    if (uploadModalEl) uploadStoryModalInstance = new window.bootstrap.Modal(uploadModalEl);
  }

  // Setup choice modal actions
  document.getElementById("btn-choice-add-story")?.addEventListener("click", () => {
    if (!loggedInUserId) {
      alert("Please log in to keep stories on URVI!");
      window.location.href = "logins/login.html";
      return;
    }
    if (choiceModalInstance) choiceModalInstance.hide();
    if (uploadStoryModalInstance) uploadStoryModalInstance.show();
  });

  setupStoryUploadHandlers();
  setupStoryViewerEvents();

  // Listen for real-time stories from Firebase RTDB
  onValue(ref(db, "stories"), (snapshot) => {
    const rawStories = snapshot.val() || {};
    processAndRenderStories(rawStories);
  });
}

function setupStoryUploadHandlers() {
  const fileInput = document.getElementById("story-file-input");
  const previewBox = document.getElementById("story-media-preview-box");
  const form = document.getElementById("story-upload-form");
  const submitBtn = document.getElementById("btn-submit-story");
  const progressContainer = document.getElementById("story-progress-container");
  const progressBar = document.getElementById("story-progress-bar");

  fileInput?.addEventListener("change", function () {
    selectedStoryFile = this.files[0] || null;
    if (!selectedStoryFile) {
      previewBox?.classList.add("d-none");
      return;
    }

    const isVideo = selectedStoryFile.type.startsWith("video/");
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = function () {
        window.URL.revokeObjectURL(v.src);
        if (v.duration > 30) {
          alert("⚠️ Story videos are limited to 30 seconds. Please select a shorter video clip.");
          fileInput.value = "";
          selectedStoryFile = null;
          previewBox?.classList.add("d-none");
        } else {
          renderStoryPreview(selectedStoryFile, true);
        }
      };
      v.src = URL.createObjectURL(selectedStoryFile);
    } else {
      renderStoryPreview(selectedStoryFile, false);
    }
  });

  function renderStoryPreview(file, isVid) {
    if (!previewBox) return;
    previewBox.classList.remove("d-none");
    const url = URL.createObjectURL(file);
    if (isVid) {
      previewBox.innerHTML = `<video src="${url}" controls class="w-100 rounded-3" style="max-height:220px; background:#0F172A;"></video>`;
    } else {
      previewBox.innerHTML = `<img src="${url}" class="w-100 rounded-3" style="max-height:300px; height:auto; object-fit:contain; background:#0b0f19;" alt="Story Preview">`;
    }
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!loggedInUserId) {
      alert("Please log in to share stories!");
      window.location.href = "logins/login.html";
      return;
    }

    if (!selectedStoryFile) {
      alert("Please select a photo or video to share.");
      return;
    }

    const caption = document.getElementById("story-caption-input")?.value.trim() || "";
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Uploading...`;
    progressContainer?.classList.remove("d-none");

    try {
      // 1. Upload to Cloudinary
      const cloudData = await uploadToCloudinaryDetailed(selectedStoryFile, (pct) => {
        if (progressBar) progressBar.style.width = `${pct}%`;
      });

      // 2. Fetch logged-in user details
      let authorName = "Volunteer";
      let authorPic = "";
      const cached = localStorage.getItem("urvi_user_data");
      if (cached) {
        try {
          const u = JSON.parse(cached);
          authorName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || loggedInUserId;
          authorPic = u.profilePic || "";
        } catch { /* ignore */ }
      }

      const isVid = selectedStoryFile.type.startsWith("video/") || cloudData.resource_type === "video";
      const now = Date.now();

      // 3. Save to Firebase stories/ node with 24-hr expiry
      const newStoryRef = push(ref(db, "stories"));
      await set(newStoryRef, {
        userId: loggedInUserId,
        username: authorName,
        userAvatar: authorPic,
        mediaUrl: cloudData.secure_url,
        mediaType: isVid ? "video" : "image",
        caption: caption,
        createdAt: now,
        expiresAt: now + (24 * 60 * 60 * 1000) // Exactly 24 hours
      });

      // Reset
      form.reset();
      selectedStoryFile = null;
      previewBox?.classList.add("d-none");
      progressContainer?.classList.add("d-none");
      if (progressBar) progressBar.style.width = "0%";
      if (uploadStoryModalInstance) uploadStoryModalInstance.hide();

      alert("🎉 Your 24-hour Story has been shared with the URVI community!");
    } catch (err) {
      console.error("Story upload error:", err);
      alert("Failed to post story: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="bi bi-send-fill me-1"></i> Share to Story`;
    }
  });
}

function processAndRenderStories(rawStories) {
  const tray = document.getElementById("stories-tray");
  if (!tray) return;

  const now = Date.now();
  const seenIds = getSeenStoryIds();

  // Filter out stories that expired past 24 hours
  const activeStories = Object.entries(rawStories)
    .map(([id, data]) => ({ id, ...data }))
    .filter(s => s.expiresAt && s.expiresAt > now);

  // Group stories by userId
  storiesByUser = {};
  activeStories.forEach(s => {
    const uid = s.userId || "anonymous";
    if (!storiesByUser[uid]) storiesByUser[uid] = [];
    storiesByUser[uid].push(s);
  });

  // Sort each user's stories chronologically
  Object.keys(storiesByUser).forEach(uid => {
    storiesByUser[uid].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  });

  // Prepare ordered user keys: unseen first, then seen
  const otherUsers = Object.keys(storiesByUser).filter(uid => uid !== loggedInUserId);
  otherUsers.sort((a, b) => {
    const aHasUnseen = storiesByUser[a].some(s => !seenIds.includes(s.id));
    const bHasUnseen = storiesByUser[b].some(s => !seenIds.includes(s.id));
    if (aHasUnseen && !bHasUnseen) return -1;
    if (!aHasUnseen && bHasUnseen) return 1;
    return (storiesByUser[b][0]?.createdAt || 0) - (storiesByUser[a][0]?.createdAt || 0);
  });

  // User list in viewer starts with loggedInUser (if they have stories), followed by other users
  storyUserKeys = [];
  if (loggedInUserId && storiesByUser[loggedInUserId]) {
    storyUserKeys.push(loggedInUserId);
  }
  storyUserKeys = storyUserKeys.concat(otherUsers);

  // Render Story Bubbles
  let html = "";

  // 1. Current User's "Your Story / Add" Bubble
  let myAvatar = null;
  let myName = "You";
  if (loggedInUserId) {
    const cached = localStorage.getItem("urvi_user_data");
    if (cached) {
      try {
        const u = JSON.parse(cached);
        if (u.profilePic && u.profilePic.length > 5 && u.profilePic !== "default" && !u.profilePic.includes("logo.png")) {
          myAvatar = u.profilePic;
        }
        myName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || u.user_id || loggedInUserId;
      } catch { /* ignore */ }
    }
  }

  const myInitial = (myName.charAt(0) || "U").toUpperCase();
  const myStories = loggedInUserId ? (storiesByUser[loggedInUserId] || []) : [];
  const hasMyStories = myStories.length > 0;
  const myRingClass = hasMyStories ? "story-ring" : "story-ring seen";

  const myAvatarHTML = myAvatar
    ? `<img src="${myAvatar}" class="story-avatar-img" alt="Your Story">`
    : (loggedInUserId
        ? `<div class="story-avatar-img story-avatar-initial">${myInitial}</div>`
        : `<div class="story-avatar-img story-avatar-initial" style="background:#E2E8F0;color:#64748B;"><i class="bi bi-person-fill" style="font-size:22px;"></i></div>`
    );

  html += `
    <div class="story-item" id="story-item-self">
      <div class="${myRingClass}">
        ${myAvatarHTML}
        <div class="story-add-badge"><i class="bi bi-plus-lg"></i></div>
      </div>
      <span class="story-username">Your Story</span>
    </div>
  `;

  // 2. Other Users' Story Bubbles
  otherUsers.forEach(uid => {
    const uStories = storiesByUser[uid];
    const latestStory = uStories[uStories.length - 1];
    const allSeen = uStories.every(s => seenIds.includes(s.id));
    const ringClass = allSeen ? "story-ring seen" : "story-ring";
    const hasPic = latestStory.userAvatar && latestStory.userAvatar.length > 5 && latestStory.userAvatar !== "default" && !latestStory.userAvatar.includes("logo.png");
    const name = latestStory.username || uid;
    const initial = (name.charAt(0) || "U").toUpperCase();

    const userAvatarHTML = hasPic
      ? `<img src="${latestStory.userAvatar}" class="story-avatar-img" alt="${name}">`
      : `<div class="story-avatar-img story-avatar-initial" style="background:linear-gradient(135deg,#10B981 0%,#047857 100%);color:#fff;">${initial}</div>`;

    html += `
      <div class="story-item story-user-bubble" data-uid="${uid}">
        <div class="${ringClass}">
          ${userAvatarHTML}
        </div>
        <span class="story-username">${name}</span>
      </div>
    `;
  });

  tray.innerHTML = html;

  // Wire Click Handlers
  document.getElementById("story-item-self")?.addEventListener("click", () => {
    if (!loggedInUserId) {
      alert("Please log in to add stories or community posts!");
      window.location.href = "logins/login.html";
      return;
    }
    // If user has stories, directly open their story in the viewer
    // Inside the viewer, they immediately see "New Story" and "Delete" options
    if (hasMyStories) {
      openStoryViewer(loggedInUserId);
      return;
    }
    // Show choice modal if no active stories
    if (choiceModalInstance) choiceModalInstance.show();
  });

  tray.querySelectorAll(".story-user-bubble").forEach(bubble => {
    bubble.addEventListener("click", () => {
      const uid = bubble.dataset.uid;
      openStoryViewer(uid);
    });
  });
}

// -----------------------------------------------------------------
// Full-Screen Story Viewer Navigation, Auto-Play, Likes & Viewers
// -----------------------------------------------------------------
const sessionViewedStories = new Set();
let isStoryPaused = false;
let storyRemainingTime = 5000;

function pauseStoryTimer() {
  if (isStoryPaused) return;
  isStoryPaused = true;
  clearTimeout(storyStepTimer);
  cancelAnimationFrame(storyAnimationReq);
  const mediaContainer = document.getElementById("storyViewerMediaContainer");
  const vid = mediaContainer?.querySelector("video");
  if (vid) vid.pause();
  const elapsed = performance.now() - storyProgressStart;
  storyRemainingTime = Math.max(500, storyCurrentDuration - elapsed);
}

function resumeStoryTimer() {
  if (!isStoryPaused) return;
  isStoryPaused = false;
  const mediaContainer = document.getElementById("storyViewerMediaContainer");
  const vid = mediaContainer?.querySelector("video");
  if (vid) {
    vid.play().catch(() => {});
  }
  const currentFill = document.getElementById(`story-progress-fill-${currentStoryItemIdx}`);
  storyProgressStart = performance.now() - (storyCurrentDuration - storyRemainingTime);
  runStoryProgressAnimation(currentFill, storyCurrentDuration);
  storyStepTimer = setTimeout(() => {
    advanceStory(1);
  }, storyRemainingTime);
}

function openStoryViewer(userId) {
  const overlay = document.getElementById("storyViewerOverlay");
  if (!overlay) return;

  const userIdx = storyUserKeys.indexOf(userId);
  if (userIdx === -1) return;

  currentStoryUserIdx = userIdx;
  currentStoryItemIdx = 0;

  overlay.classList.remove("d-none");
  document.body.style.overflow = "hidden"; // freeze scroll

  showStoryItem();
}

function closeStoryViewer() {
  const overlay = document.getElementById("storyViewerOverlay");
  if (overlay) overlay.classList.add("d-none");
  document.body.style.overflow = "";

  clearTimeout(storyStepTimer);
  cancelAnimationFrame(storyAnimationReq);
  isStoryPaused = false;

  document.getElementById("storyViewersSheet")?.classList.add("d-none");

  const mediaContainer = document.getElementById("storyViewerMediaContainer");
  if (mediaContainer) {
    const vid = mediaContainer.querySelector("video");
    if (vid) vid.pause();
    mediaContainer.innerHTML = "";
  }
}

function showStoryItem() {
  clearTimeout(storyStepTimer);
  cancelAnimationFrame(storyAnimationReq);
  isStoryPaused = false;

  document.getElementById("storyViewersSheet")?.classList.add("d-none");

  const currentUid = storyUserKeys[currentStoryUserIdx];
  const userStories = storiesByUser[currentUid] || [];

  if (currentStoryItemIdx >= userStories.length) {
    // Next user
    if (currentStoryUserIdx + 1 < storyUserKeys.length) {
      currentStoryUserIdx++;
      currentStoryItemIdx = 0;
      showStoryItem();
      return;
    } else {
      closeStoryViewer();
      return;
    }
  }

  if (currentStoryItemIdx < 0) {
    // Prev user
    if (currentStoryUserIdx > 0) {
      currentStoryUserIdx--;
      const prevUserStories = storiesByUser[storyUserKeys[currentStoryUserIdx]] || [];
      currentStoryItemIdx = Math.max(0, prevUserStories.length - 1);
      showStoryItem();
      return;
    } else {
      currentStoryItemIdx = 0;
    }
  }

  const story = userStories[currentStoryItemIdx];
  if (!story) {
    closeStoryViewer();
    return;
  }

  markStoryAsSeen(story.id);

  // ── Free Tier Optimized View Tracking ──
  // Only records 1 write per session for other users' stories (under 50 bytes)
  if (loggedInUserId && loggedInUserId !== story.userId) {
    if (!sessionViewedStories.has(story.id)) {
      sessionViewedStories.add(story.id);
      let vName = "URVI Member";
      let vAvatar = "";
      try {
        const udata = JSON.parse(localStorage.getItem("urvi_user_data") || "{}");
        vName = `${udata.firstName || ""} ${udata.lastName || ""}`.trim() || udata.name || loggedInUserId;
        vAvatar = udata.profilePic || "";
      } catch { /* ignore */ }
      try {
        update(ref(db, `stories/${story.id}/views/${loggedInUserId}`), {
          name: vName,
          avatar: vAvatar,
          time: Date.now()
        });
        if (!story.views) story.views = {};
        story.views[loggedInUserId] = { name: vName, avatar: vAvatar, time: Date.now() };
      } catch (e) {
        console.warn("View record error:", e);
      }
    }
  }

  const isOwner = loggedInUserId && (story.userId === loggedInUserId);

  // 1. Owner Buttons in Header (New Story & Delete)
  const btnNew = document.getElementById("btn-story-new");
  const btnDelete = document.getElementById("btn-story-delete");
  if (btnNew) btnNew.classList.toggle("d-none", !isOwner);
  if (btnDelete) btnDelete.classList.toggle("d-none", !isOwner);

  // 2. Views Count (STRICTLY FOR STORY OWNER: Hidden for everyone else!)
  const viewersContainer = document.getElementById("storyViewersContainer");
  const viewsObj = story.views || {};
  const viewsCount = Object.keys(viewsObj).length;
  const viewsCountEl = document.getElementById("story-viewers-count");
  const btnViewers = document.getElementById("btn-story-viewers");

  if (viewersContainer) {
    // Only the story creator can see their story views!
    viewersContainer.classList.toggle("d-none", !isOwner);
  }
  if (viewsCountEl && isOwner) {
    viewsCountEl.innerText = `${viewsCount} Viewers`;
  }
  if (btnViewers && isOwner) {
    btnViewers.title = "See who viewed this story";
    btnViewers.classList.add("clickable");
  }

  // 3. Likes State (STRICTLY FOR COMMUNITY MEMBERS: Hidden on your own story!)
  const likesContainer = document.getElementById("storyLikesContainer");
  if (likesContainer) {
    // When viewing your own story, the like button is completely HIDDEN (Zero option of self-liking!)
    likesContainer.classList.toggle("d-none", isOwner);
  }

  if (!isOwner) {
    const likesObj = story.likes || {};
    const likesCount = Object.keys(likesObj).length;
    const isLiked = loggedInUserId && !!likesObj[loggedInUserId];
    const likesCountEl = document.getElementById("story-likes-count");
    const likeIcon = document.getElementById("story-like-icon");
    const btnLike = document.getElementById("btn-story-like");

    if (likesCountEl) likesCountEl.innerText = likesCount;

    if (btnLike) {
      btnLike.classList.add("story-like-btn");
      btnLike.classList.remove("story-likes-display");
      btnLike.style.cursor = "pointer";
      btnLike.title = isLiked ? "Unlike story" : "Like story";
      btnLike.classList.toggle("liked", isLiked);
      if (likeIcon) {
        likeIcon.className = isLiked ? "bi bi-heart-fill text-danger me-1" : "bi bi-heart me-1";
      }
    }
  }

  // Update header
  const avatarEl = document.getElementById("storyViewerAvatar");
  const usernameEl = document.getElementById("storyViewerUsername");
  const timeEl = document.getElementById("storyViewerTime");
  const captionEl = document.getElementById("storyViewerCaption");

  const authorDisplayName = story.username || story.userId || "User";
  const hasPic = story.userAvatar && story.userAvatar.length > 5 && story.userAvatar !== "default" && !story.userAvatar.includes("logo.png");
  const fallbackPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(authorDisplayName)}&background=22C55E&color=fff&size=100&bold=true`;

  if (avatarEl) avatarEl.src = hasPic ? story.userAvatar : fallbackPic;
  if (usernameEl) usernameEl.innerText = authorDisplayName;
  if (captionEl) captionEl.innerText = story.caption || "";

  if (timeEl && story.createdAt) {
    const elapsedHrs = Math.floor((Date.now() - story.createdAt) / (1000 * 60 * 60));
    timeEl.innerText = elapsedHrs > 0 ? `${elapsedHrs}h ago` : "Just now";
  }

  // Build segmented progress bars
  const progressContainer = document.getElementById("storyProgressSegments");
  if (progressContainer) {
    progressContainer.innerHTML = userStories.map((_, idx) => `
      <div class="story-progress-bar-bg">
        <div class="story-progress-bar-fill" id="story-progress-fill-${idx}" style="width: ${idx < currentStoryItemIdx ? '100%' : '0%'};"></div>
      </div>
    `).join("");
  }

  // Load media into stage
  const mediaContainer = document.getElementById("storyViewerMediaContainer");
  if (!mediaContainer) return;
  mediaContainer.innerHTML = "";

  const currentFill = document.getElementById(`story-progress-fill-${currentStoryItemIdx}`);
  const isVid = isVideoUrl(story.mediaUrl) || story.mediaType === "video";

  if (isVid) {
    const video = document.createElement("video");
    video.src = story.mediaUrl;
    video.autoplay = true;
    video.playsInline = true;
    video.className = "story-viewer-media";

    video.onloadedmetadata = function () {
      storyCurrentDuration = Math.min(30, video.duration || 10) * 1000;
      storyProgressStart = performance.now();
      runStoryProgressAnimation(currentFill, storyCurrentDuration);
    };

    video.onended = function () {
      advanceStory(1);
    };

    video.onerror = function () {
      advanceStory(1);
    };

    mediaContainer.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = story.mediaUrl;
    img.className = "story-viewer-media";
    mediaContainer.appendChild(img);

    storyCurrentDuration = 5000; // 5 seconds for photos
    storyProgressStart = performance.now();
    runStoryProgressAnimation(currentFill, storyCurrentDuration);

    storyStepTimer = setTimeout(() => {
      advanceStory(1);
    }, storyCurrentDuration);
  }
}

function runStoryProgressAnimation(fillEl, duration) {
  if (!fillEl) return;
  const start = performance.now();

  function step(now) {
    if (isStoryPaused) return;
    const elapsed = now - start;
    const pct = Math.min(100, (elapsed / duration) * 100);
    fillEl.style.width = `${pct}%`;

    if (elapsed < duration) {
      storyAnimationReq = requestAnimationFrame(step);
    }
  }

  storyAnimationReq = requestAnimationFrame(step);
}

function advanceStory(direction) {
  clearTimeout(storyStepTimer);
  cancelAnimationFrame(storyAnimationReq);

  currentStoryItemIdx += direction;
  showStoryItem();
}

function setupStoryViewerEvents() {
  document.getElementById("btn-close-story-viewer")?.addEventListener("click", closeStoryViewer);

  document.getElementById("storyTapLeft")?.addEventListener("click", (e) => {
    e.stopPropagation();
    advanceStory(-1);
  });

  document.getElementById("storyTapRight")?.addEventListener("click", (e) => {
    e.stopPropagation();
    advanceStory(1);
  });

  // Story Like Button Toggle
  document.getElementById("btn-story-like")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const currentUid = storyUserKeys[currentStoryUserIdx];
    const userStories = storiesByUser[currentUid] || [];
    const currentStory = userStories[currentStoryItemIdx];
    if (!currentStory) return;

    // You cannot like your own story!
    if (loggedInUserId && currentStory.userId === loggedInUserId) {
      return;
    }

    if (!loggedInUserId) {
      alert("Please log in to like stories!");
      window.location.href = "logins/login.html";
      return;
    }

    if (!currentStory.likes) currentStory.likes = {};
    const wasLiked = !!currentStory.likes[loggedInUserId];

    try {
      if (wasLiked) {
        delete currentStory.likes[loggedInUserId];
        await remove(ref(db, `stories/${currentStory.id}/likes/${loggedInUserId}`));
      } else {
        currentStory.likes[loggedInUserId] = true;
        await set(ref(db, `stories/${currentStory.id}/likes/${loggedInUserId}`), true);
      }

      const count = Object.keys(currentStory.likes).length;
      const countEl = document.getElementById("story-likes-count");
      const icon = document.getElementById("story-like-icon");
      const btn = document.getElementById("btn-story-like");
      if (countEl) countEl.innerText = count;
      if (icon) icon.className = !wasLiked ? "bi bi-heart-fill text-danger me-1" : "bi bi-heart me-1";
      if (btn) btn.classList.toggle("liked", !wasLiked);
    } catch (err) {
      console.warn("Like story error:", err);
    }
  });

  // Story Owner "New Story" action
  document.getElementById("btn-story-new")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeStoryViewer();
    if (!loggedInUserId) {
      alert("Please log in to keep stories on URVI!");
      window.location.href = "logins/login.html";
      return;
    }
    if (uploadStoryModalInstance) uploadStoryModalInstance.show();
  });

  // Story Owner "Delete" action
  document.getElementById("btn-story-delete")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    const currentUid = storyUserKeys[currentStoryUserIdx];
    const userStories = storiesByUser[currentUid] || [];
    const currentStory = userStories[currentStoryItemIdx];
    if (!currentStory) return;

    pauseStoryTimer();
    const ok = confirm("Are you sure you want to delete this story?");
    if (!ok) {
      resumeStoryTimer();
      return;
    }

    try {
      await remove(ref(db, `stories/${currentStory.id}`));
      userStories.splice(currentStoryItemIdx, 1);
      if (userStories.length === 0) {
        closeStoryViewer();
      } else {
        if (currentStoryItemIdx >= userStories.length) {
          currentStoryItemIdx = userStories.length - 1;
        }
        showStoryItem();
      }
      alert("Story deleted 🌿");
    } catch (err) {
      alert("Failed to delete story: " + err.message);
      resumeStoryTimer();
    }
  });

  // Viewers Sheet click handler
  document.getElementById("btn-story-viewers")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const currentUid = storyUserKeys[currentStoryUserIdx];
    const userStories = storiesByUser[currentUid] || [];
    const currentStory = userStories[currentStoryItemIdx];
    if (!currentStory) return;

    if (currentStory.userId !== loggedInUserId) {
      return; // Non-owners only see view count number
    }

    pauseStoryTimer();
    const sheet = document.getElementById("storyViewersSheet");
    const list = document.getElementById("storyViewersList");
    const badge = document.getElementById("storyViewersCountBadge");
    if (!sheet || !list) return;

    const views = currentStory.views || {};
    const likes = currentStory.likes || {};
    const totalLikes = Object.keys(likes).length;
    const viewerEntries = Object.entries(views);
    if (badge) {
      badge.innerHTML = `${viewerEntries.length} <span class="ms-2 text-danger"><i class="bi bi-heart-fill me-1"></i>${totalLikes}</span>`;
    }

    if (viewerEntries.length === 0) {
      list.innerHTML = `<div class="text-center text-white-50 p-4 small">No views yet. Your story was shared recently 🌿</div>`;
    } else {
      viewerEntries.sort((a, b) => (b[1].time || 0) - (a[1].time || 0));
      list.innerHTML = viewerEntries.map(([uid, v]) => {
        let relTime = "Recently";
        if (v.time) {
          const diffMin = Math.floor((Date.now() - v.time) / 60000);
          if (diffMin < 1) relTime = "Just now";
          else if (diffMin < 60) relTime = `${diffMin}m ago`;
          else relTime = `${Math.floor(diffMin / 60)}h ago`;
        }
        const hasLiked = !!likes[uid];
        const vName = v.name || uid || 'URVI Member';
        const vHasPic = v.avatar && v.avatar.length > 5 && v.avatar !== "default" && !v.avatar.includes("logo.png");
        const vPic = vHasPic ? v.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(vName)}&background=22C55E&color=fff&size=100&bold=true`;
        return `
          <div class="story-viewer-user-row">
            <div class="d-flex align-items-center gap-2">
              <img src="${vPic}" class="rounded-circle" style="width:34px;height:34px;object-fit:cover;">
              <div class="text-white small fw-semibold">${vName}</div>
              ${hasLiked ? '<span class="badge bg-danger-subtle text-danger ms-1" style="font-size:10px;"><i class="bi bi-heart-fill me-1"></i>Liked</span>' : ''}
            </div>
            <small class="text-white-50" style="font-size:11px;">${relTime}</small>
          </div>
        `;
      }).join("");
    }

    sheet.classList.remove("d-none");
  });

  // Close Viewers sheet
  document.getElementById("btn-close-story-viewers-sheet")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const sheet = document.getElementById("storyViewersSheet");
    if (sheet) sheet.classList.add("d-none");
    resumeStoryTimer();
  });

  // Keyboard navigation
  window.addEventListener("keydown", (e) => {
    const overlay = document.getElementById("storyViewerOverlay");
    if (!overlay || overlay.classList.contains("d-none")) return;
    if (e.key === "Escape") closeStoryViewer();
    if (e.key === "ArrowLeft") advanceStory(-1);
    if (e.key === "ArrowRight") advanceStory(1);
  });
}
